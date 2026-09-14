import "/src/app.css";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { markdownPreview } from "/src/lib/services/markdown.js";

const doc = "- a\n- b\n\n1. a\n2. b\n\n- [ ] a\n- [ ] b\n\ntext\n";
const view = new EditorView({
  state: EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown({ base: markdownLanguage }), markdownPreview, EditorView.lineWrapping],
  }),
  parent: document.getElementById("host"),
});

setTimeout(() => {
  const lines = [...document.querySelectorAll(".cm-line")];
  const report = lines.map((line, i) => {
    const first = line.firstElementChild;
    const boxes = [...line.children].map((el) => `${el.className}@${el.getBoundingClientRect().x.toFixed(1)}w${el.getBoundingClientRect().width.toFixed(1)}`);
    const range = document.createRange();
    range.selectNodeContents(line);
    const last = line.lastChild;
    let textX = "-";
    if (last && last.nodeType === 3) { const r = document.createRange(); r.selectNode(last); textX = r.getBoundingClientRect().x.toFixed(1); }
    const cs = getComputedStyle(line);
    return `${i} "${line.textContent}" lineX=${line.getBoundingClientRect().x.toFixed(1)} pad=${cs.paddingLeft} ti=${cs.textIndent} | ${boxes.join(" ")} | text=${textX}`;
  }).join("\n");
  const css = getComputedStyle(document.querySelector(".cm-content"));
  fetch("http://127.0.0.1:8765/result", { method: "POST", mode: "no-cors", body: report + `\ncontent: fs=${css.fontSize} ws=${css.whiteSpace} font=${css.fontFamily}\nua=${navigator.userAgent}` });
}, 1200);
