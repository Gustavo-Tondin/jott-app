// Auto-closing pairs in the note editor — the Obsidian gesture (user call,
// 2026-08-19).
//
// Typing an opener writes the closer too and parks the caret between them, so
// `**` is two keystrokes and the way out is the arrow key.
//
// **There is no escape hatch, and that was decided rather than forgotten.**
// The ask was "hold Shift for a single character", and it cannot be built: on
// this keyboard `(` is Shift+9, `"` is Shift+' and `*` is Shift+8, so all
// three reach the app with `shiftKey` already true and nothing tells them
// apart. What stands in for it is what Obsidian itself relies on — typing the
// closer steps over the one already there, Backspace between a fresh pair
// takes both, and a mark never closes with a word pressed up against it.
//
// Two families, two mechanisms, and the split was MEASURED against the real
// library rather than read out of its source:
//
//   * `(`, `[`, `{`, `"` are brackets, and CodeMirror's `closeBrackets` is
//     already right about them — including the part that matters most here,
//     that `[` twice writes `[[|]]`, which is what opens the reference
//     autocomplete (`services/linkComplete.js`).
//   * `*`, `_`, `~`, `` ` `` are Markdown marks, and `closeBrackets` is wrong
//     about them in precisely the case that was asked for. Its `handleSame` is
//     built for programming-language strings, where a quote inside a quote
//     ends the string; in Markdown a mark inside the same mark is BOLD.
//     Measured: typing `*` twice gave `**|` (the second one stepped over the
//     first one's closer) instead of `**|**`, and pressing `*` at the end of
//     `**text|**` gave `**text*|***` instead of stepping out.
//
// So the marks are handled here, in full — including the keystroke that turns
// out to be an ordinary character, because handing that one back would let
// `closeBrackets` answer it with the behaviour above.
//
// **Ownership is deliberately NOT tracked**, and that too is a measurement.
// CodeMirror remembers which closers it wrote, and forgets one the moment
// anything is typed against it (`MapMode.TrackAfter`) — which is every closer
// this file cares about, since `**text|**` is the state you reach by typing
// inside the pair. A memory that is always empty when consulted is not a
// memory. The rules below are structural instead: what the caret is standing
// between decides, and the same document always gets the same answer.

import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";

/// The Markdown marks that pair.
///
/// `=` is deliberately absent: `==highlight==` is not CommonMark, and pairing
/// it would invite writing it — which changes the dialect of the file, a
/// decision about the format (spec 5) and not about the keyboard.
export const MARKS = ["*", "_", "~", "`"];

/// The brackets that pair.
///
/// `'` is deliberately absent, unlike CodeMirror's default: in Portuguese
/// prose an apostrophe is a letter (`d'água`) far more often than it is a
/// quote, and a pair written into the middle of a word is worse than no pair.
export const BRACKETS = ["(", "[", "{", '"'];

/// How deep the same mark nests before the app stops opening new pairs.
/// Three is `***bold italic***`, the last nesting Markdown gives a meaning to.
const MAX_RUN = 3;

/// What may sit after the caret and still let a pair open — end of line,
/// whitespace, or punctuation that closes something else. A letter pressed up
/// against the caret means the mark is being typed INTO a word, where an
/// invented closer lands in the middle of it.
const CLOSE_BEFORE = ")]}:;>,.!?\"'`*_~";

const isWord = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/// How many `mark` characters sit immediately before / after `pos`.
function runBefore(doc, pos, mark) {
  let n = 0;
  while (pos - n > 0 && doc.sliceString(pos - n - 1, pos - n) === mark) n++;
  return n;
}

function runAfter(doc, pos, mark) {
  let n = 0;
  while (pos + n < doc.length && doc.sliceString(pos + n, pos + n + 1) === mark) n++;
  return n;
}

/// Is the caret inside a free-standing, balanced, EMPTY run of `mark` — the
/// `*|*` that typing one mark leaves behind?
///
/// The two outer checks are what tell that state apart from `**text*|*`, where
/// the runs are also balanced at one each: there, the run behind the caret has
/// a word pressed against it, which makes it the END of something rather than
/// the start.
function insideEmptyPair(doc, pos, mark) {
  const before = runBefore(doc, pos, mark);
  const after = runAfter(doc, pos, mark);
  if (before < 1 || before !== after || before >= MAX_RUN) return false;
  const outerBefore = doc.sliceString(pos - before - 1, pos - before);
  const outerAfter = doc.sliceString(pos + after, pos + after + 1);
  return (
    outerBefore !== mark &&
    outerAfter !== mark &&
    !isWord(outerBefore) &&
    !isWord(outerAfter)
  );
}

/// What typing `mark` at the selection means. A transaction spec, always —
/// the ordinary keystroke included, for the reason in the header.
export function markInput(state, mark) {
  const changes = state.changeByRange((range) => {
    // A selection is wrapped, the way `closeBrackets` wraps one: select a
    // word, press `*`, get `*word*`.
    if (!range.empty) {
      return {
        changes: [
          { from: range.from, insert: mark },
          { from: range.to, insert: mark },
        ],
        range: EditorSelection.range(
          range.anchor + mark.length,
          range.head + mark.length,
        ),
      };
    }

    const pos = range.head;
    const doc = state.doc;

    // 1. Inside the empty pair the app just opened: deepen it. This is the
    //    whole point — it is what makes `*` twice mean bold.
    if (insideEmptyPair(doc, pos, mark)) {
      return {
        changes: { from: pos, insert: mark + mark },
        range: EditorSelection.cursor(pos + mark.length),
      };
    }

    const ahead = doc.sliceString(pos, pos + 1);
    const behind = doc.sliceString(pos - 1, pos);

    // 2. A mark ahead with something written behind: the text being marked is
    //    finished, so step OVER the closer instead of writing a third one.
    //    The arrow key does the same thing; this is for the hand that types
    //    the mark out of habit.
    if (ahead === mark && behind && !/\s/.test(behind)) {
      return { range: EditorSelection.cursor(pos + mark.length) };
    }

    // 3. Open a pair, where a mark can begin. Three things stop it:
    //
    //    * `_` after a word: CommonMark gives no meaning to `foo_bar_`, so
    //      closing there writes a pair that renders as nothing — and it would
    //      fight snake_case, which is the other thing `_` is typed for.
    //    * THE SAME MARK ALREADY TOUCHING THE CARET, on either side (user
    //      report, 2026-09-07). Deleting one of the four asterisks of
    //      `**word**` leaves `**word*`, and typing the missing one back has
    //      exactly one right answer: one character. A pair there wrote
    //      `**word***`, which is the bug — and the rule reads the same from
    //      the other side, so `*` typed in front of `**word**` is one
    //      character too. The two states where a mark against the caret DOES
    //      mean something are already answered above: the empty pair the app
    //      itself opened (1) and the finished pair the caret steps out of (2).
    const opens =
      (!ahead || /\s/.test(ahead) || CLOSE_BEFORE.includes(ahead)) &&
      ahead !== mark &&
      behind !== mark &&
      !(mark === "_" && isWord(behind));
    if (opens) {
      return {
        changes: { from: pos, insert: mark + mark },
        range: EditorSelection.cursor(pos + mark.length),
      };
    }

    // 4. An ordinary character.
    return {
      changes: { from: pos, insert: mark },
      range: EditorSelection.cursor(pos + mark.length),
    };
  });
  return state.update(changes, {
    scrollIntoView: true,
    userEvent: "input.type",
  });
}

/// The input handler, in front of `closeBrackets`'s own.
const markHandler = EditorView.inputHandler.of((view, from, to, insert) => {
  if (view.state.readOnly) return false;
  if (!MARKS.includes(insert)) return false;
  // Not a plain keystroke — a composition, a paste, a completion writing
  // itself in. Those mean the text they say they mean.
  if (view.composing || view.compositionStarted) return false;
  const sel = view.state.selection.main;
  if (from !== sel.from || to !== sel.to) return false;
  view.dispatch(markInput(view.state, insert));
  return true;
});

/// Everything the editor needs for pairs to close themselves.
///
/// The marks are declared to `closeBrackets` as well as handled here, and that
/// is not a contradiction: its input handler never sees them (the one above
/// answers first, always), but its Backspace command reads the same list — so
/// deleting the caret out of a fresh `*|*` takes both, exactly as it does out
/// of `(|)`.
export const autoClose = [
  markdownLanguage.data.of({
    closeBrackets: { brackets: [...BRACKETS, ...MARKS] },
  }),
  Prec.high(markHandler),
  closeBrackets(),
  Prec.high(keymap.of(closeBracketsKeymap)),
];

/// The bracket half alone, for a PLAIN-TEXT field (the task description,
/// 2026-08-19).
///
/// `[` twice still leaves `[[|]]` — which is what opens the reference
/// autocomplete (`services/linkComplete.js`) — but the Markdown marks stay
/// ordinary characters: a description is never rendered as Markdown, so a
/// paired `*` would decorate nothing and just be a stray character to delete.
/// Declared as global language data because a plain field has no language to
/// hang the list on.
export const plainAutoClose = [
  EditorState.languageData.of(() => [{ closeBrackets: { brackets: BRACKETS } }]),
  closeBrackets(),
  Prec.high(keymap.of(closeBracketsKeymap)),
];
