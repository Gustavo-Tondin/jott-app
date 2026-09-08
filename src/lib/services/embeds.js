// A file of the notebook inside a note: `[[/foto.jpg]]`. The double bracket
// is a reference to something INSIDE the notebook; the leading slash tells a
// FILE from a note (`[[Ideias]]`). Not CommonMark and not Obsidian's `![[…]]`:
// another editor shows the literal text. The library is flat, so the name is
// the whole address. Drawn by the same `revealedBy` rule as every other mark.

import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { ASSETS_DIR, isImage } from "./assets.js";
import { leafOf } from "./paths.js";
import { revealedBy } from "./markdown.js";

/// Anything in double brackets. Which of the two it is, is the slash.
const REFERENCE = /\[\[([^[\]\n]+)\]\]/g;

/// The text a note carries for a file of the library.
export function embedMarkdown(address) {
  const name = leafOf(String(address ?? ""));
  return name ? `[[/${name}]]` : "";
}

/// The text a note carries for another note: the TITLE, not the address —
/// a title survives the note being moved, and a rename follows it into every
/// link in the core (`Notebook::rename_note`). Two notes may share a title:
/// clicking one opens the SEARCH at that title rather than guessing.
export function noteMarkdown(title) {
  const clean = String(title ?? "").trim();
  return clean ? `[[${clean}]]` : "";
}

/// How a file is named inside the brackets — `/foto.jpg`: the piece you paste
/// between a pair of brackets, not the folder it lives in.
export function referenceName(address) {
  const name = leafOf(String(address ?? ""));
  return name ? `/${name}` : "";
}

/// The address a file name inside the brackets stands for.
function embedAddress(name) {
  return `${ASSETS_DIR}/${name}`;
}

/// Every reference in a piece of text, as absolute document offsets. Pure,
/// and takes text rather than a view.
export function referencesIn(text, offset = 0) {
  const found = [];
  for (const match of String(text ?? "").matchAll(REFERENCE)) {
    const inside = match[1];
    const at = {
      from: offset + match.index,
      to: offset + match.index + match[0].length,
    };
    if (!inside.startsWith("/")) {
      found.push({ ...at, kind: "note", title: inside });
      continue;
    }
    // A file of the library, which is FLAT — a name with a slash left in it
    // addresses nothing here, and is left as the text the user wrote.
    const name = inside.slice(1);
    if (!name || name.includes("/")) continue;
    found.push({ ...at, kind: "file", name, address: embedAddress(name), image: isImage(name) });
  }
  return found;
}

/// What a file reference becomes on a line the cursor is not on: an image is
/// DRAWN; anything else is a chip with the name and the system's icon when it
/// has one. Clicking the chip opens the file the way task attachments do (`open_asset`).
class EmbedWidget extends WidgetType {
  constructor(embed, ctx) {
    super();
    this.embed = embed;
    this.ctx = ctx;
    // Resolved HERE and not in `toDOM`: the URL is part of the widget's
    // identity, so `eq` sees a changed library — otherwise CodeMirror keeps
    // the old `<img>` for ever and a deleted picture stays on screen.
    this.url = embed.kind === "file" ? (ctx.url?.(embed.address) ?? "") : "";
  }

  eq(other) {
    return (
      other.embed.kind === this.embed.kind &&
      other.embed.address === this.embed.address &&
      other.embed.title === this.embed.title &&
      other.embed.image === this.embed.image &&
      other.embed.opened === this.embed.opened &&
      other.url === this.url
    );
  }

  toDOM(view) {
    const { address, name, image, kind, title } = this.embed;
    if (kind === "note") return this.note(title);
    if (image) return this.picture(view, address, name);
    return this.chip(address, name);
  }

  /// Another note: its title, dressed as a link. No widget of its own kind —
  /// what a note link SHOWS is the text already inside the brackets, and the
  /// only thing being hidden is the brackets themselves.
  note(title) {
    const link = document.createElement("span");
    link.className = "cm-link-note";
    link.textContent = title;
    link.title = title;
    link.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.ctx.openNote?.(title);
    });
    return link;
  }

  picture(view, address, name) {
    const frame = document.createElement("span");
    frame.className = "cm-embed cm-embed--image";
    if (this.embed.opened) {
      // The second click, on a photo whose link is already showing: full
      // screen. The first click was what revealed the link, so this one is
      // free to mean something else.
      frame.classList.add("cm-embed--opened");
      frame.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.ctx.zoom?.(address);
      });
    }
    const img = document.createElement("img");
    img.src = this.url;
    // The file's name, minus its extension: the only description the app has,
    // and better than nothing for someone listening to the note.
    img.alt = name.replace(/\.[^.]+$/, "");
    // A picture arrives with a size the editor did not plan for; without this
    // the lines below it stay where they were and the caret lands wrong.
    img.addEventListener("load", () => view.requestMeasure());
    img.addEventListener("error", () => {
      frame.classList.add("cm-embed--missing");
      frame.textContent = name;
    });
    frame.appendChild(img);
    return frame;
  }

  chip(address, name) {
    const chip = document.createElement("span");
    chip.className = "cm-embed cm-embed--file";
    chip.title = name;

    const glyph = document.createElement("span");
    glyph.className = "cm-embed__glyph";
    // What the app can always draw: the extension, in the file's own shape.
    // The system's icon replaces it when the system has one — asked for
    // asynchronously, because the answer crosses the bridge.
    glyph.dataset.ext = (name.split(".").pop() ?? "").slice(0, 4).toUpperCase();
    chip.appendChild(glyph);

    const label = document.createElement("span");
    label.className = "cm-embed__name";
    label.textContent = name;
    chip.appendChild(label);

    this.ctx.icon?.(name)?.then((url) => {
      if (!url) return;
      const icon = document.createElement("img");
      icon.src = url;
      icon.alt = "";
      glyph.replaceChildren(icon);
      glyph.classList.add("cm-embed__glyph--system");
    });

    chip.addEventListener("mousedown", (event) => {
      // `mousedown` and not `click`, for the reason the checkbox gives: a
      // click would move the caret into the line first, which un-draws the
      // very chip being clicked.
      event.preventDefault();
      this.ctx.open?.(address);
    });
    return chip;
  }

  ignoreEvent() {
    return false;
  }
}

/// The decorations for `ranges` — one per file reference nobody is inside.
export function embedDecorationsFor(state, ranges, ctx = {}) {
  const builder = new RangeSetBuilder();
  const reveals = revealedBy(state);

  // What this notebook draws at all (App Functions): a reference the user
  // switched off is left as text. Asked per KIND — `[[Nota]]` is WikiLinks,
  // `[[/foto.jpg]]` is Embedded images and files.
  const shows = (kind) => ctx.shows?.(kind) ?? true;

  for (const { from, to } of ranges) {
    let line = state.doc.lineAt(from);
    while (line.from <= to) {
      const found = referencesIn(line.text, line.from).filter((ref) => shows(ref.kind));
      // TWO PASSES, because the builder takes positions in order: a chip
      // replaces the reference where it stands, a revealed picture hangs off
      // the END of the line. One pass would offer `line.to` then walk back.
      const opened = [];
      for (const embed of found) {
        if (reveals(embed.from, embed.to)) {
          opened.push(embed);
          continue;
        }
        builder.add(embed.from, embed.to, Decoration.replace({ widget: new EmbedWidget(embed, ctx) }));
      }
      // The reference being edited shows its text — and a PICTURE keeps
      // showing below it, so a click reveals the link without the photo
      // vanishing. Only pictures: a chip would say the same thing twice.
      for (const embed of opened) {
        if (embed.kind !== "file" || !embed.image) continue;
        builder.add(
          line.to,
          line.to,
          Decoration.widget({
            widget: new EmbedWidget({ ...embed, opened: true }, ctx),
            block: true,
            side: 1,
          }),
        );
      }
      if (line.to >= state.doc.length) break;
      line = state.doc.lineAt(line.to + 1);
    }
  }
  return builder.finish();
}

/// "The library changed — draw it again." A `StateField` only recomputes on
/// a transaction, and deleting a file happens in another screen entirely.
export const refreshEmbeds = StateEffect.define();

/// Draws the notebook's files inside the note. Built with its context: a
/// file's URL needs the open notebook's root, which is the shell's business.
/// A `StateField`, not a `ViewPlugin`: a plugin's BLOCK decorations (the
/// picture under the edited line) are dropped in silence. See docs/platform-gotchas.md#codemirror
export function fileEmbeds(ctx = {}) {
  const whole = (state) => embedDecorationsFor(state, [{ from: 0, to: state.doc.length }], ctx);
  return StateField.define({
    create: whole,
    update(value, tr) {
      // The selection matters as much as the document: moving the cursor onto
      // the line is what turns the picture back into its text.
      if (tr.effects.some((effect) => effect.is(refreshEmbeds))) return whole(tr.state);
      return tr.docChanged || tr.selection ? whole(tr.state) : value;
    },
    provide: (field) => [
      EditorView.decorations.from(field),
      // A drawn file is ONE thing to the caret: an arrow key steps over it
      // whole rather than into the middle of an address nobody can see.
      EditorView.atomicRanges.of((view) => view.state.field(field, false) ?? Decoration.none),
    ],
  });
}
