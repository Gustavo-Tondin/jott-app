// The head of a note, as the blocks a card draws — a tiny reader for the
// markdown the core sends (`Note::preview`), not a second editor. Nothing here
// is interactive (the whole card is one link) and nothing carries colour.
// Not handled, on purpose: nested lists (indent dropped), tables beyond the
// header, footnotes, HTML beyond `<u>`; what fails to parse shows as text.

import { referencesIn } from "./embeds.js";
import { isDelimiterRow, isTableRow, splitRow } from "./tables.js";

/// The fenced-code fence, and the three shapes of a horizontal rule.
const FENCE = /^\s*(```|~~~)/;
const RULE = /^\s*(?:\*\s*\*\s*\*[\s*]*|-\s*-\s*-[\s-]*|_\s*_\s*_[\s_]*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const TASK = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

/// A markdown image — `![alt](address)`. Dropped whole: the note has a banner
/// for a picture, and a card must not read the disk to draw a thumbnail.
const IMAGE = /!\[[^\]]*\]\([^)\s]*(?:\s+"[^"]*")?\)/g;
/// A link — the words are the content, the address is plumbing.
const LINK = /\[([^\]]*)\]\([^)\s]*(?:\s+"[^"]*")?\)/g;

/// The inline marks, longest delimiter first: `**` has to be tried before `*`
/// or every strong span would parse as two empty emphases.
const MARKS = [
  { style: "code", pattern: /`([^`\n]+)`/, literal: true },
  // `***both***` — the one nesting of a mark inside ITSELF with a pattern of
  // its own; other nesting alternates delimiters and falls out of the
  // recursion. `**a *b***` reads as one strong run with a literal `*`: known limit.
  { style: "both", pattern: /\*\*\*([\s\S]+?)\*\*\*/ },
  { style: "strong", pattern: /\*\*([\s\S]+?)\*\*/ },
  { style: "strong", pattern: /__([\s\S]+?)__/ },
  { style: "strike", pattern: /~~([\s\S]+?)~~/ },
  { style: "underline", pattern: /<u>([\s\S]+?)<\/u>/i },
  { style: "em", pattern: /\*([^*\n]+)\*/ },
  { style: "em", pattern: /_([^_\n]+)_/ },
];

/// The blocks of a piece of markdown. Each is `{kind, …}`: `heading` (with
/// `level`), `paragraph`, `bullet`, `ordered` (with `marker`), `task` (with
/// `done`), `quote`, `code` (with `text`), `rule` or `table` (its header's
/// cells only — "there is a table here"). All but `code` and `rule` carry `spans`.
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

    // A table is a row of pipes with the delimiter under it; the rows that
    // follow belong to it and are not drawn — the header is the summary.
    if (isTableRow(line) && i + 1 < lines.length && isDelimiterRow(lines[i + 1])) {
      close();
      const header = splitRow(line).filter((cell) => cell.trim() !== "");
      blocks.push({ kind: "table", text: header.join("  ·  ") });
      for (i += 2; i < lines.length && lines[i].trim() && isTableRow(lines[i]); i += 1);
      i -= 1;
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
/// `referencesIn` owns the `[[…]]` syntax (`services/embeds.js`); a second
/// reader here would be the copy that goes stale.
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

  // Removing a picture mid-sentence leaves double spaces and "foto ." — tidied
  // ONLY where something was actually removed, so the writer's own spacing
  // elsewhere is never edited.
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
