// Auto-closing pairs in the note editor: an opener writes the closer and parks
// the caret between; there is no escape hatch (`(`, `"` and `*` all arrive with
// `shiftKey` true). Brackets are `closeBrackets`'s; the Markdown marks are
// handled here in full and structurally — no ownership memory, CodeMirror
// forgets a closer once anything is typed against it. See docs/platform-gotchas.md#codemirror

import { EditorSelection, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdownLanguage } from "@codemirror/lang-markdown";

/// The Markdown marks that pair. `=` is absent: `==highlight==` is not
/// CommonMark, and pairing it would invite writing it.
export const MARKS = ["*", "_", "~", "`"];

/// The brackets that pair. `'` is absent, unlike CodeMirror's default: in
/// Portuguese prose an apostrophe is a letter (`d'água`) far more than a quote.
const BRACKETS = ["(", "[", "{", '"'];

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
/// `*|*` typing one leaves? The outer checks tell it apart from `**text*|*`,
/// where the run behind the caret has a word pressed against it.
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
function markInput(state, mark) {
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

    // 3. Open a pair, where a mark can begin. Two things stop it: `_` after a
    //    word (`foo_bar_` means nothing in CommonMark and fights snake_case),
    //    and the SAME MARK already touching the caret on either side — typing
    //    the missing asterisk of `**word*` back has one right answer, one char.
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

/// Everything the editor needs for pairs to close themselves. The marks are
/// declared to `closeBrackets` too: its input handler never sees them (the one
/// above answers first), but its Backspace reads the list, so `*|*` takes both.
export const autoClose = [
  markdownLanguage.data.of({
    closeBrackets: { brackets: [...BRACKETS, ...MARKS] },
  }),
  Prec.high(markHandler),
  closeBrackets(),
  Prec.high(keymap.of(closeBracketsKeymap)),
];

/// The bracket half alone, for a PLAIN-TEXT field (the task description):
/// `[[` still opens the reference autocomplete, but the marks stay ordinary
/// characters. Global language data because a plain field has no language.
export const plainAutoClose = [
  EditorState.languageData.of(() => [{ closeBrackets: { brackets: BRACKETS } }]),
  closeBrackets(),
  Prec.high(keymap.of(closeBracketsKeymap)),
];
