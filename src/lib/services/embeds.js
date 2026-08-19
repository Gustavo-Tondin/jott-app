// A file of the notebook, inside a note: `[[/foto.jpg]]`.
//
// The syntax is the app's own, decided by the user on 2026-08-19 after
// looking at Obsidian's wikilinks. Two halves of that decision, and the
// reasons they were taken:
//
//   - **The double bracket** is the shape a reference to something INSIDE the
//     notebook takes — files and notes alike, which is what makes it one
//     syntax and not two. A `![alt](assets/foto.jpg)` says the same
//     thing in CommonMark and would render in any other editor; what it does
//     not say is that the address belongs to this notebook rather than to the
//     web.
//   - **The leading slash** is what separates a FILE from a note. `[[Ideias]]`
//     is a note; `[[/foto.jpg]]` is a file of the library. One character, read
//     the same way a path reads, and it keeps the two namespaces from ever
//     having to be told apart by guessing.
//
// The cost, written down so nobody rediscovers it as a surprise: this is not
// CommonMark. Open the `.md` in another editor and the line reads as the
// literal text `[[/foto.jpg]]` — the file is still there, still named, still
// findable, but not drawn. It is also not Obsidian's: there an embed is
// `![[…]]` and a bare `[[…]]` is a link.
//
// **The library is flat** (`core/src/assets.rs`), so the name inside the
// brackets is the whole address: `[[/foto.jpg]]` is `assets/foto.jpg` and
// nothing else. A name with a slash left in it addresses nothing here and is
// left as the text the user wrote.
//
// Without the slash it is a NOTE (2026-08-19), carried by title — the reason
// is on `noteMarkdown`. Both are drawn by the same rule as every other piece
// of syntax in this editor: the line the cursor is on shows what was typed,
// every other line shows what it means.

import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { ASSETS_DIR, isImage } from "./assets.js";
import { activeLines } from "./markdown.js";

/// Anything in double brackets. Which of the two it is, is the slash.
const REFERENCE = /\[\[([^[\]\n]+)\]\]/g;

/// The text a note carries for a file of the library.
export function embedMarkdown(address) {
  const name = String(address ?? "").split("/").pop() ?? "";
  return name ? `[[/${name}]]` : "";
}

/// The text a note carries for another note.
///
/// The TITLE and not the address, decided with the same question the assets
/// were decided with (2026-08-18): what survives the note being moved. A note
/// is moved between folders and between spaces in two clicks now, and an
/// address written into a body would go stale on every one of them. A title
/// goes stale on a RENAME, and that half is paid in the core: renaming a note
/// follows it into every link (`Notebook::rename_note`).
///
/// The cost that remains, and it is real: two notes may share a title.
/// Clicking one of those opens the SEARCH at that title rather than guessing —
/// the app picked the wrong twin once already (v0.5.0) and will not again.
export function noteMarkdown(title) {
  const clean = String(title ?? "").trim();
  return clean ? `[[${clean}]]` : "";
}

/// How a file is named inside the brackets — `/foto.jpg`. What the Images
/// screen offers to copy (user call, 2026-08-19): the piece you paste between
/// a pair of brackets, not the folder it happens to live in.
export function referenceName(address) {
  const name = String(address ?? "").split("/").pop() ?? "";
  return name ? `/${name}` : "";
}

/// The address a file name inside the brackets stands for.
function embedAddress(name) {
  return `${ASSETS_DIR}/${name}`;
}

/// Every reference in a piece of text, as absolute document offsets.
///
/// Pure, and takes text rather than a view: what counts as a reference is a
/// fact about the document, and nothing about layout.
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

/// What a file reference becomes on a line the cursor is not on.
///
/// An image is DRAWN; anything else is a chip with the file's name and, when
/// the system can say what that kind of file looks like, the system's own
/// icon for it. Clicking the chip opens the file in whatever the system uses
/// for it — the same door the task attachments knock on (`open_asset`).
class EmbedWidget extends WidgetType {
  constructor(embed, ctx) {
    super();
    this.embed = embed;
    this.ctx = ctx;
    // Resolved HERE, when the decoration is built, and not in `toDOM`: it is
    // part of what makes this widget this widget. Asking the context again
    // later would answer the same thing on both sides of an `eq`, and
    // CodeMirror would keep the old `<img>` for ever — which is exactly what
    // kept a deleted picture on screen (2026-08-19).
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

/// The decorations for `ranges` — one per file reference on an inactive line.
export function embedDecorationsFor(state, ranges, ctx = {}) {
  const builder = new RangeSetBuilder();
  const active = activeLines(state);

  for (const { from, to } of ranges) {
    let line = state.doc.lineAt(from);
    while (line.from <= to) {
      const found = referencesIn(line.text, line.from);
      if (!active.has(line.number)) {
        for (const embed of found) {
          builder.add(embed.from, embed.to, Decoration.replace({ widget: new EmbedWidget(embed, ctx) }));
        }
      } else {
        // The line being edited shows its text — and a PICTURE keeps showing
        // too, below it (user call, 2026-08-19). Clicking a photo used to make
        // it vanish and leave an address behind, which reads as having broken
        // something. So: one click reveals the link above the photo, and the
        // photo is still there to be clicked again.
        //
        // Only pictures. A chip is the size of the text that would replace it
        // and says the same thing twice; a photo is the thing itself.
        for (const embed of found) {
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
      }
      if (line.to >= state.doc.length) break;
      line = state.doc.lineAt(line.to + 1);
    }
  }
  return builder.finish();
}

/// Draws the notebook's files inside the note.
///
/// Built with its context rather than importing one: the URL of a file needs
/// the open notebook's root, and opening one is the shell's business. The
/// editor stays a component that knows about text (`Editor.svelte`).
///
/// **A `StateField` and not a `ViewPlugin`**, which is not a style choice:
/// the picture that stays under the line being edited is a BLOCK widget, and
/// CodeMirror does not accept block decorations from a plugin — they were
/// dropped in silence, and the photo simply did not come back (2026-08-19).
/// The cost is reading the whole document instead of the visible part, which
/// for a note is the same thing.
/// "The library changed — draw it again."
///
/// A `StateField` only recomputes when a transaction arrives, and deleting a
/// file happens in another screen entirely: without this, the open note went
/// on showing a picture whose file was in the trash (user report,
/// 2026-08-19).
export const refreshEmbeds = StateEffect.define();

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
