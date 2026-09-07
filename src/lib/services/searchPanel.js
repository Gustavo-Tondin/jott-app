// The note's find & replace panel — the app's own DOM for CodeMirror's own
// search (user call, 2026-09-07: "deixe o design UX do ctrl + h / replace
// mais simples, trocando next e previous por flechas pra baixo e pra cima, e
// botando as opções de check dentro de um submenu").
//
// CodeMirror ships a panel of its own, and everything that SEARCHES stays its
// (`SearchQuery`, `findNext`, `replaceAll`, the highlights, the keymap): what
// changes is only the furniture. Its panel is a strip of words — "next",
// "previous", "all", three labelled checkboxes, "replace", "replace all" —
// nine controls on one line; this one is a field, two arrows, a gear that
// opens the three switches, a close, and the replace row under it. The panel
// is handed to `search({createPanel})`, which is the door CodeMirror leaves
// open for exactly this.
//
// Plain DOM, not Svelte: a panel is created by CodeMirror with the view and
// lives inside the editor's own element, outside any component tree. The
// classes are `editor-search__*`, dressed in editor.css beside the rest of
// the editor's furniture.

import { runScopeHandlers } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import arrowDown from "../../assets/icons/phosphor/regular/arrow-down.svg?raw";
import arrowUp from "../../assets/icons/phosphor/regular/arrow-up.svg?raw";
import sliders from "../../assets/icons/phosphor/regular/sliders-horizontal.svg?raw";
import close from "../../assets/icons/phosphor/regular/x.svg?raw";
import { S } from "./strings.js";

/// The name the replace field carries, so `Editor.openReplace` can find it.
export const REPLACE_FIELD = "replace";

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

/// An icon button of the panel: the app's own `.theme-btn--icon`, the SVG
/// inline like `Icon.svelte` draws it.
function iconButton(svg, label, onclick, extra = "") {
  const button = el("button", {
    type: "button",
    class: `theme-btn--icon editor-search__button ${extra}`.trim(),
    "aria-label": label,
    title: label,
    onclick,
  });
  const glyph = el("span", { class: "theme-icon", "aria-hidden": "true" });
  glyph.style.setProperty("--icon-size", "1rem");
  glyph.innerHTML = svg;
  button.append(glyph);
  return button;
}

/// One of the three switches, in the options popover.
function option(name, label, checked, onchange) {
  const box = el("input", { type: "checkbox", class: "theme-checkbox", name, onchange });
  box.checked = checked;
  return el("label", { class: "editor-search__option" }, [box, document.createTextNode(label)]);
}

/// Builds the panel for `view`. The shape CodeMirror expects back:
/// `{dom, top, mount, update}`.
export function searchPanel(view) {
  let query = getSearchQuery(view.state);

  const searchField = el("input", {
    type: "text",
    class: "theme-input editor-search__field",
    name: "search",
    "main-field": "true",
    placeholder: S.noteFindPlaceholder,
    "aria-label": S.noteFindPlaceholder,
    autocomplete: "off",
    onkeyup: commit,
    onchange: commit,
  });
  searchField.value = query.search;
  const replaceField = el("input", {
    type: "text",
    class: "theme-input editor-search__field",
    name: REPLACE_FIELD,
    placeholder: S.noteReplacePlaceholder,
    "aria-label": S.noteReplacePlaceholder,
    autocomplete: "off",
    onkeyup: commit,
    onchange: commit,
  });
  replaceField.value = query.replace;

  const caseBox = option("case", S.findMatchCase, query.caseSensitive, commit);
  const reBox = option("re", S.findRegexp, query.regexp, commit);
  const wordBox = option("word", S.findByWord, query.wholeWord, commit);
  const options = el("div", { class: "theme-popover editor-search__options", hidden: true }, [
    caseBox,
    wordBox,
    reBox,
  ]);
  const check = (holder) => holder.querySelector("input").checked;

  /// The gear: the three switches, folded away until asked. A press toggles;
  /// a click anywhere else, or Escape, folds it back.
  const gear = iconButton(sliders, S.findOptions, () => showOptions(options.hidden), "editor-search__gear");
  gear.setAttribute("aria-expanded", "false");
  function showOptions(on) {
    options.hidden = !on;
    gear.setAttribute("aria-expanded", String(on));
    gear.classList.toggle("is-active", on);
    if (on) options.querySelector("input")?.focus();
  }
  function onDocumentPointer(event) {
    if (options.hidden) return;
    if (dom.contains(event.target) && event.target.closest(".editor-search__options, .editor-search__gear"))
      return;
    showOptions(false);
  }

  /// Reads the fields into a query; the highlights and the arrows follow.
  function commit() {
    const next = new SearchQuery({
      search: searchField.value,
      caseSensitive: check(caseBox),
      regexp: check(reBox),
      wholeWord: check(wordBox),
      replace: replaceField.value,
    });
    if (next.eq(query)) return;
    query = next;
    view.dispatch({ effects: setSearchQuery.of(next) });
  }

  const row = el("div", { class: "editor-search__row" }, [
    searchField,
    iconButton(arrowUp, S.findPrevious, () => findPrevious(view)),
    iconButton(arrowDown, S.findNext, () => findNext(view)),
    gear,
    iconButton(close, S.findClose, () => closeSearchPanel(view), "editor-search__close"),
  ]);
  // The two actions sit in a box as wide as the four squares above, so the
  // replace field lines up under the find field.
  const replaceRow = el("div", { class: "editor-search__row editor-search__row--replace" }, [
    replaceField,
    el("div", { class: "editor-search__actions" }, [
      el("button", { type: "button", class: "theme-btn editor-search__action", onclick: () => replaceNext(view) }, [
        document.createTextNode(S.replaceOne),
      ]),
      el("button", { type: "button", class: "theme-btn editor-search__action", onclick: () => replaceAll(view) }, [
        document.createTextNode(S.replaceAll),
      ]),
    ]),
  ]);

  const dom = el(
    "div",
    {
      class: "editor-search",
      // CodeMirror's own `search-panel` scope: Enter finds the next, Shift+Enter
      // the previous, Escape closes — the same keys its panel answers, kept.
      onkeydown: (event) => {
        if (event.key === "Escape" && !options.hidden) {
          event.preventDefault();
          showOptions(false);
          return;
        }
        if (runScopeHandlers(view, event, "search-panel")) event.preventDefault();
        else if (event.key === "Enter" && event.target === replaceField) {
          event.preventDefault();
          replaceNext(view);
        }
      },
    },
    view.state.readOnly ? [row, options] : [row, replaceRow, options],
  );

  return {
    dom,
    top: true,
    mount() {
      searchField.select();
      document.addEventListener("pointerdown", onDocumentPointer, true);
    },
    destroy() {
      document.removeEventListener("pointerdown", onDocumentPointer, true);
    },
    update(update) {
      // A query set from outside (the command that opens the panel with the
      // selection already in it) lands in the fields.
      for (const tr of update.transactions) {
        for (const effect of tr.effects) {
          if (effect.is(setSearchQuery) && !effect.value.eq(query)) {
            query = effect.value;
            searchField.value = query.search;
            replaceField.value = query.replace;
            caseBox.querySelector("input").checked = query.caseSensitive;
            reBox.querySelector("input").checked = query.regexp;
            wordBox.querySelector("input").checked = query.wholeWord;
          }
        }
      }
    },
  };
}
