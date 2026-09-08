// What another app put on the clipboard, read as the note's own Markdown.
// Anything that formats text writes BOTH a `text/html` and a `text/plain`
// stripped of every mark (Keep, Docs, Notion, a web page) — taking the plain
// half is what loses the style. Only shapes this app WRITES come out; nothing
// is carried through as raw HTML, and no character is escaped, so text that
// was already Markdown arrives spelt the way it was written.

import { INDENT } from "./markdownCommands.js";
import { renderTable } from "./tables.js";

/// Elements that stand on a line of their own, whatever the stylesheet of the
/// page they came from said. Everything else is read as inline.
const BLOCKS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DETAILS", "DIV", "DL",
  "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3",
  "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE",
  "SECTION", "TABLE", "UL",
]);

/// Dropped whole, content and all.
const MUTE = new Set(["HEAD", "LINK", "META", "NOSCRIPT", "SCRIPT", "STYLE", "TITLE"]);

/// The clipboard's HTML as Markdown, or `""` when it carried no text.
export function htmlToMarkdown(html) {
  const body = new DOMParser().parseFromString(String(html ?? ""), "text/html").body;
  return body ? tidy(blocksOf(body).join("\n\n")) : "";
}

/// The blocks inside `parent`. A run of inline nodes between two blocks is a
/// paragraph of its own — that is what a bare `<br>`-separated fragment is.
function blocksOf(parent) {
  const out = [];
  let run = "";
  const flush = () => {
    if (run.trim()) out.push(run.trim());
    run = "";
  };
  for (const node of parent.childNodes) {
    const element = node.nodeType === 1 ? node : null;
    if (node.nodeType === 8 || (element && MUTE.has(element.tagName))) continue;
    if (element && BLOCKS.has(element.tagName)) {
      flush();
      for (const block of blockOf(element)) if (block.trim()) out.push(block);
    } else {
      run += inline(node);
    }
  }
  flush();
  return out;
}

/// One block element as the lines it stands for. An unknown container answers
/// with whatever is inside it, which is how a page of nested `<div>`s reads.
function blockOf(element) {
  const tag = element.tagName;
  if (tag === "HR") return ["---"];
  if (/^H[1-6]$/.test(tag)) {
    const text = oneLine(childrenOf(element));
    return text ? [`${"#".repeat(Number(tag[1]))} ${text}`] : [];
  }
  if (tag === "PRE") return [fenced(element)];
  if (tag === "UL" || tag === "OL") return [listOf(element, tag === "OL", "")];
  if (tag === "LI") return [`- ${oneLine(childrenOf(element))}`];
  if (tag === "BLOCKQUOTE") return [quoted(blocksOf(element))];
  if (tag === "TABLE") return [tableOf(element)];
  if (tag === "P" || tag === "DT" || tag === "DD" || tag === "FIGCAPTION") {
    return [childrenOf(element).trim()];
  }
  return blocksOf(element);
}

/// A list and everything nested under it, as its lines. `indent` is what the
/// depth is worth — the same `INDENT` a list typed in the editor uses, so a
/// pasted sublist and a typed one are the same bytes.
function listOf(element, ordered, indent) {
  const lines = [];
  let number = Number(element.getAttribute("start")) || 1;
  for (const item of element.children) {
    if (item.tagName !== "LI") continue;
    const { text, box, nested } = itemOf(item, indent);
    const marker = box !== null ? `- [${box ? "x" : " "}] ` : ordered ? `${number++}. ` : "- ";
    lines.push(`${indent}${marker}${text}`.trimEnd());
    for (const sub of nested) if (sub) lines.push(sub);
  }
  return lines.join("\n");
}

/// One list item split three ways: its own text, whether it is a checkbox and
/// how it stands, and the lists nested under it.
function itemOf(item, indent) {
  let text = "";
  let box = null;
  const nested = [];
  for (const node of item.childNodes) {
    const element = node.nodeType === 1 ? node : null;
    if (element && (element.tagName === "UL" || element.tagName === "OL")) {
      nested.push(listOf(element, element.tagName === "OL", indent + INDENT));
    } else if (element && element.tagName === "INPUT" && element.getAttribute("type") === "checkbox") {
      box = element.checked || element.hasAttribute("checked");
    } else {
      text += inline(node);
    }
  }
  text = oneLine(text);
  // A checklist that came as a plain list with the box DRAWN into the text —
  // which is how Keep and Docs write one.
  const drawn = /^([☐☑✅✔✗✘]|\[[ xX]\])[ \t]+/.exec(text);
  if (box === null && drawn) {
    box = /[☑✅✔xX]/.test(drawn[1]);
    text = text.slice(drawn[0].length);
  }
  return { text, box, nested };
}

/// A node read as inline text. A block met in the middle of a run answers with
/// its own lines rather than being flattened into the sentence around it.
function inline(node) {
  if (node.nodeType === 3) return collapse(node.nodeValue);
  if (node.nodeType !== 1) return "";
  const tag = node.tagName;
  if (MUTE.has(tag)) return "";
  if (tag === "BR") return "\n";
  if (tag === "INPUT") return "";
  if (tag === "IMG") {
    const src = node.getAttribute("src");
    return src ? `![${node.getAttribute("alt") ?? ""}](${src})` : "";
  }
  if (tag === "CODE" || tag === "KBD" || tag === "SAMP") {
    const text = oneLine(childrenOf(node));
    return text ? `\`${text}\`` : "";
  }
  if (BLOCKS.has(tag)) return blockOf(node).join("\n\n");
  const marks = marksOf(node, tag);
  if (tag === "A") {
    const href = node.getAttribute("href");
    // A link is already drawn as one; underlining it too says nothing.
    const text = wrap(childrenOf(node), { ...marks, under: false });
    return href && text.trim() ? `[${oneLine(text)}](${href})` : text;
  }
  return wrap(childrenOf(node), marks);
}

/// Every child of `node`, read inline and joined.
function childrenOf(node) {
  let out = "";
  for (const child of node.childNodes) out += inline(child);
  return out;
}

/// What an element says about its own text. The TAG and the INLINE STYLE both
/// count: Keep and Docs mark a word with `<span style="font-weight:700">` and
/// no `<b>` in sight. `<b style="font-weight:normal">` is the wrapper Docs puts
/// around everything it copies — the tag says bold and the style says it is not.
function marksOf(element, tag) {
  const style = element.style ?? {};
  const weight = String(style.fontWeight ?? "");
  const line = `${style.textDecoration ?? ""} ${style.textDecorationLine ?? ""}`;
  const heavy = weight === "bold" || weight === "bolder" || Number(weight) >= 600;
  const light = weight === "normal" || weight === "lighter" || (weight !== "" && Number(weight) <= 400);
  return {
    bold: heavy || ((tag === "STRONG" || tag === "B") && !light),
    italic: tag === "EM" || tag === "I" || style.fontStyle === "italic",
    strike: tag === "S" || tag === "DEL" || tag === "STRIKE" || /line-through/.test(line),
    under: tag === "U" || tag === "INS" || /underline/.test(line),
  };
}

/// `text` wearing its marks. Only the middle is wrapped — Markdown will not
/// open a mark on a space, so the padding stays outside. `<u>` because that is
/// the app's own spelling of an underline (`markdownCommands.js`).
function wrap(text, marks) {
  const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!core) return text;
  let out = core;
  if (marks.strike) out = `~~${out}~~`;
  if (marks.under) out = `<u>${out}</u>`;
  if (marks.italic) out = `*${out}*`;
  if (marks.bold) out = `**${out}**`;
  return `${lead}${out}${tail}`;
}

/// A `<pre>` as a fenced block, with the language its class names, and a fence
/// long enough to hold code that has backticks of its own.
function fenced(element) {
  const code = element.textContent.replace(/\s+$/, "");
  const named = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(
    `${element.className} ${element.firstElementChild?.className ?? ""}`,
  );
  const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${named ? named[1] : ""}\n${code}\n${fence}`;
}

/// Blocks under a `>`. An empty line inside a quote carries the mark too, or
/// the quote would end there.
function quoted(blocks) {
  return blocks
    .join("\n\n")
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

/// A `<table>` as GFM, written by the same renderer the editor writes with —
/// the first row is the header, as GFM has no other kind, and every row is cut
/// or filled to the widest.
function tableOf(element) {
  const rows = [];
  for (const row of element.querySelectorAll("tr")) {
    const cells = [...row.children].filter((cell) => cell.tagName === "TD" || cell.tagName === "TH");
    if (cells.length) rows.push(cells.map((cell) => oneLine(childrenOf(cell))));
  }
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const fit = (row) => Array.from({ length: width }, (_, i) => row[i] ?? "");
  const [header, ...body] = rows.map(fit);
  return renderTable({ header, align: header.map(() => null), rows: body });
}

/// HTML whitespace, collapsed the way a browser draws it: a newline in the
/// source is a space, a run of spaces is one space, and a non-breaking space
/// is a space the app can type.
function collapse(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

/// `text` with every line break turned back into a space — for the places
/// Markdown gives one line and one only: a heading, a list item, a cell.
function oneLine(text) {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/// The document as it is written to the note: no trailing spaces, never more
/// than one blank line, nothing hanging off either end.
function tidy(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
