// The head of a note, as the blocks a card draws.
//
// The card is not a second editor. The note's own live preview is CodeMirror
// (`services/markdown.js`), and running fifty of those on a board would cost
// fifty editors to draw text nobody can click. So this is the other half of
// the same idea, from the other end: a tiny reader that turns the markdown
// the core sends (`Note::preview`) into blocks and spans, and a component
// that draws them (`components/NotePreview.svelte`).
//
// **Nothing here is interactive** (user call, 2026-08-20: "sem link nem nada
// interativo desde o grid"). A reference is its own text, a link is its
// words, an image is not loaded at all — the whole card is one link, to the
// note, and a second target inside it would only fight with that.
//
// **Nothing here carries colour either.** The hierarchy is size, weight and
// shape; the ink stays the muted grey the preview always had ("mas cinza
// opaco como agora"). A board is a place to recognise a note from across the
// screen, not to read it — accented headings on twenty cards at once turn the
// board into a stained-glass window.
//
// What it deliberately does NOT do: nested lists (the indent is dropped, the
// bullet stays), tables, footnotes, HTML beyond `<u>`. A preview that fails
// to parse something shows it as the text it is, which is the honest fallback
// for a format the user owns.

import { referencesIn } from "./embeds.js";

/// The fenced-code fence, and the three shapes of a horizontal rule.
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*(?:\*\s*\*\s*\*[\s*]*|-\s*-\s*-[\s-]*|_\s*_\s*_[\s_]*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const TASK = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

/// A markdown image — `![alt](address)`. Dropped whole: the note has a banner
/// for a picture, and a card that fetched the images of every note on the
/// board would read the disk once per card to draw a thumbnail nobody asked
/// for.
const IMAGE = /!\[[^\]]*\]\([^)\s]*(?:\s+"[^"]*")?\)/g;
/// A link — the words are the content, the address is plumbing.
const LINK = /\[([^\]]*)\]\([^)\s]*(?:\s+"[^"]*")?\)/g;

/// The inline marks, longest delimiter first: `**` has to be tried before `*`
/// or every strong span would parse as two empty emphases.
const MARKS = [
  { style: "code", pattern: /`([^`\n]+)`/, literal: true },
  // `***assim***` — the one nesting of a mark inside ITSELF that is worth a
  // pattern of its own. Everything else nests by alternating the two
  // delimiters (`**a _b_**`), which falls out of the recursion for free; a
  // `**a *b***` is read as one strong run with a literal `*` in it, and that
  // is the limit written down rather than a delimiter-run parser on a card.
  { style: "both", pattern: /\*\*\*([\s\S]+?)\*\*\*/ },
  { style: "strong", pattern: /\*\*([\s\S]+?)\*\*/ },
  { style: "strong", pattern: /__([\s\S]+?)__/ },
  { style: "strike", pattern: /~~([\s\S]+?)~~/ },
  { style: "underline", pattern: /<u>([\s\S]+?)<\/u>/i },
  { style: "em", pattern: /\*([^*\n]+)\*/ },
  { style: "em", pattern: /_([^_\n]+)_/ },
];

/// The blocks of a piece of markdown.
///
/// Each is `{kind, …}`: `heading` (with `level`), `paragraph`, `bullet`,
/// `ordered` (with `marker`), `task` (with `done`), `quote`, `code` (with
/// `text`) or `rule`. All but the last two carry `spans`.
export function previewBlocks(markdown) {
  const lines = String(markdown ?? "").split("\n");
  const blocks = [];
  let open = null;

  /// Whatever was being gathered is finished. Consecutive lines of the same
  /// kind are ONE block: a paragraph the writer wrapped at eighty columns is
  /// a paragraph, not four, and the card would otherwise put a gap inside it.
  const close = () => {
    if (open) blocks.push(open);
    open = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // A fenced block runs to its closing fence, or to the end of the head:
    // the core cuts the preview by line count, so an unclosed fence here is
    // the normal case and not a broken document.
    if (FENCE.test(line)) {
      close();
      const body = [];
      for (i += 1; i < lines.length && !FENCE.test(lines[i]); i += 1) body.push(lines[i]);
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    if (!line.trim()) {
      close();
      continue;
    }

    if (RULE.test(line)) {
      close();
      blocks.push({ kind: "rule" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      close();
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        spans: spansOf(heading[2]),
      });
      continue;
    }

    const task = TASK.exec(line);
    if (task) {
      close();
      blocks.push({
        kind: "task",
        done: task[1].toLowerCase() === "x",
        spans: spansOf(task[2]),
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      close();
      blocks.push({ kind: "bullet", spans: spansOf(bullet[1]) });
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      close();
      blocks.push({
        kind: "ordered",
        marker: `${ordered[1]}.`,
        spans: spansOf(ordered[2]),
      });
      continue;
    }

    const quote = QUOTE.exec(line);
    const kind = quote ? "quote" : "paragraph";
    const text = quote ? quote[1] : line.trim();
    if (open?.kind !== kind) close();
    open = open ?? { kind, text: "" };
    open.text = open.text ? `${open.text} ${text}` : text;
  }
  close();

  // The gathered blocks carry raw text; the spans are read once, at the end,
  // so a wrapped paragraph is parsed as the one line it means to be (a `**`
  // opened on one line and closed on the next is ordinary markdown).
  return (
    blocks
      .map((block) =>
        block.text !== undefined && block.kind !== "code"
          ? { kind: block.kind, spans: spansOf(block.text) }
          : block,
      )
      // A line that was nothing but a picture has nothing left in it, and an
      // empty block would draw as a gap the note does not have.
      .filter((block) => !block.spans || block.spans.length > 0)
  );
}

/// A line of markdown as styled runs — `[{text, strong, em, code, strike,
/// underline}]`. Adjacent runs of the same style are not merged: the card
/// draws each as its own `<span>`, and the browser closes the gap.
export function spansOf(text, style = {}) {
  const clean = plainText(text);
  return runs(clean, style).filter((run) => run.text);
}

/// The references, links and images taken out before anything is styled.
///
/// `referencesIn` is asked what a `[[…]]` means rather than a regex written
/// here: the syntax has one owner (`services/embeds.js`), and a second reader
/// of it would be the copy that goes stale.
function plainText(text) {
  const original = String(text ?? "");
  const line = original.replace(IMAGE, "");
  let dropped = line !== original;
  let out = "";
  let at = 0;
  for (const reference of referencesIn(line)) {
    out += line.slice(at, reference.from);
    // A picture is not drawn, and it is not named either — the alternative is
    // a card that reads "foto-2026-08-19.jpg" where the note shows a picture.
    if (reference.kind === "note") out += reference.title;
    else if (!reference.image) out += reference.name;
    else dropped = true;
    at = reference.to;
  }
  out += line.slice(at);
  out = out.replace(LINK, "$1");

  // Taking a picture out of the middle of a sentence leaves the space on both
  // sides of it, and the card read "veja a foto  ." — then, once the pair was
  // collapsed, "veja a foto ." The punctuation is closed up too, and ONLY
  // where something was actually removed: the same tidying applied to every
  // line would edit what the writer typed.
  if (!dropped) return out;
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?)\]}…])/g, "$1")
    .trim();
}

function runs(text, style) {
  let earliest = null;
  for (const mark of MARKS) {
    const match = mark.pattern.exec(text);
    if (match && (!earliest || match.index < earliest.match.index)) {
      earliest = { mark, match };
    }
  }
  if (!earliest) return [{ text, ...style }];

  const { mark, match } = earliest;
  const inner =
    mark.style === "both"
      ? { ...style, strong: true, em: true }
      : { ...style, [mark.style]: true };
  return [
    ...runs(text.slice(0, match.index), style),
    // Code is literal — a `*` inside backticks is an asterisk, which is half
    // of why anyone writes backticks.
    ...(mark.literal ? [{ text: match[1], ...inner }] : runs(match[1], inner)),
    ...runs(text.slice(match.index + match[0].length), style),
  ];
}
