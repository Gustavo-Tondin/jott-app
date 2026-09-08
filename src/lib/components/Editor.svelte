<script>
  // The CodeMirror instance, wrapped so the rest of the app never imports it:
  // everything above talks in `value` and `onChange`, as with a `<textarea>`.
  import { onDestroy, onMount } from "svelte";
  import { Compartment, EditorState, Prec } from "@codemirror/state";
  import { EditorView, keymap, placeholder as placeholderExt, tooltips } from "@codemirror/view";
  import {
    defaultKeymap,
    history,
    historyKeymap,
    insertNewline,
  } from "@codemirror/commands";
  import { codeFolding, foldGutter, indentUnit } from "@codemirror/language";
  // Find and replace: CodeMirror's own panel, so the app is not maintaining a
  // second search engine for one screen.
  import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
  import { REPLACE_FIELD, searchPanel } from "../services/searchPanel.js";
  import { deleteMarkupBackward, markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { markdownPreview } from "../services/markdown.js";
  import { autocompletion } from "@codemirror/autocomplete";
  import { autoClose, plainAutoClose } from "../services/autoClose.js";
  import { foldLineClasses } from "../services/foldLines.js";
  import { blockMiddlePaste } from "../services/middlePaste.js";
  import { keepCaretInView } from "../services/caretScroll.js";
  import { fileEmbeds, refreshEmbeds } from "../services/embeds.js";
  import { noteTables, refreshTables } from "../services/tableWidget.js";
  import { activeCell, tableStatus } from "../services/tableEditing.js";
  import { fromNotebook, referenceCompletions } from "../services/linkComplete.js";
  import { pageSpace } from "../shell/keyboard.js";
  import { assetUrl } from "../services/assets.js";
  import { fileIcon } from "../services/fileIcons.js";
  import * as md from "../services/markdownCommands.js";
  import { bound } from "../services/shortcuts.js";
  import { toCodeMirror } from "../services/keys.js";

  let {
    value = "",
    readOnly = false,
    placeholder = "",
    onChange,
    /// The notebook's root, absolute — what turns `[[/foto.jpg]]` into a URL
    /// an `<img>` can load (`services/assets.js`). Without it the editor
    /// still reads the note; it just draws nothing.
    root = null,
    /// `(address) => void` — a file chip in the note was clicked. Opening one
    /// is the shell's business; the editor only says which.
    onOpenFile,
    /// `(address) => void` — a picture whose link is already showing was
    /// clicked again, which means "show me this one properly".
    onZoomImage,
    /// `(title) => void` — a link to another note was clicked. Resolving a
    /// title to a note is a question about the whole notebook, so the shell
    /// answers it (`App.svelte`).
    onOpenNote,
    /// What `[[` offers while it is typed, as `{notes, files}`. Defaults to
    /// asking the notebook; a test hands its own answers in.
    references = fromNotebook,
    /// Bumped whenever the notebook changed under the note — which for this
    /// component means one thing: the pictures may not be the pictures any
    /// more, so draw them again and ask for them again.
    version = 0,
    /// A plain-text field rather than a note: no Markdown, no search panel, no
    /// formatting chords — but the SAME `[[` language (principle 7). Only the
    /// brackets auto-close; the Markdown marks stay ordinary characters.
    plain = false,
    /// `(hasSelection) => void`, on the edges only. The editor must report it:
    /// the selection is CodeMirror's state, and `document.getSelection()`
    /// does not see it the same way.
    onSelection,
    /// What this notebook draws inside a note; both default to on. Read by the
    /// extensions through closures, so a switch flipped in Settings reaches
    /// the open note on its next transaction without tearing the editor down.
    wikiLinks = true,
    embeds = true,
    /// Whether a table is drawn as a grid. Off, it stays the pipes it is in
    /// the file.
    tables = true,
    /// How a table sits in the column: `""` squeezed to the content width,
    /// `scroll` running wide with a sideways scroll of its own.
    tableLayout = "",
    /// `({header}) | null` — whether the person is in a table cell right now
    /// (header true in the header row), or in none. The formatting panel
    /// greys its table buttons by it. Reported only on the edges, the way
    /// `onSelection` is.
    onTable,
  } = $props();

  let host;
  let view = null;
  /// Extensions are baked in at state creation; anything that changes later
  /// needs a compartment. Without this one, an editor created while the note
  /// was loading (`readOnly || loading`) stays read-only forever.
  const editable = new Compartment();
  /// The formatting keymap lives in a compartment because the chords are the
  /// user's to change: rebinding one in Settings reconfigures this without
  /// tearing the editor down and losing the cursor.
  const formatting = new Compartment();

  /// Which editor command each id runs. The table is `markdownCommands.js`'s;
  /// only `note.replace` is added here, because it needs the view this
  /// component owns.
  const EDITOR_COMMANDS = {
    ...md.EDITOR_COMMANDS,
    "note.replace": () => {
      openReplace();
      return true;
    },
  };

  /// The registry's bindings, in CodeMirror's dialect. `preventDefault` on
  /// every one: these chords belong to the editor while the cursor is in it,
  /// and the shell stands down for anything already answered (`shortcuts.js`).
  function formattingKeymap(bindings) {
    const keys = [];
    for (const [id, run] of Object.entries(EDITOR_COMMANDS)) {
      const chord = bindings.get(id);
      if (!chord) continue;
      keys.push({ key: toCodeMirror(chord), run, preventDefault: true });
    }
    return keymap.of(keys);
  }

  /// What the editor itself last produced, so an echo of our own change does
  /// not get pushed back in and move the cursor.
  let lastEmitted = null;

  /// What was last said through `onTable`, as `header|null|undefined`, so the
  /// shell hears the edges only.
  let lastTable;

  /// Whether something was selected the last time we said so. The listener
  /// fires on every cursor move; only the EDGES are worth reporting, or the
  /// shell would re-render on each arrow key.
  let lastSelected = false;

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // Everything a NOTE is and a plain field is not. Below the split is
          // the ground every text field shares — including the `[[` references.
          ...(plain ? [] : [
          // The panel sits at the TOP, where the document's own header is —
          // at the bottom it lands on the window edge, under the status of
          // nothing.
          search({ top: true, createPanel: searchPanel }),
          // NOT `highlightSelectionMatches`: a note is prose, and painting every
          // other occurrence of the selected word lit up the whole document.
          // Tab indents the LINE (`md.INDENT` says why two spaces) and no longer
          // walks out of the editor — the accepted cost for a notes app.
          indentUnit.of(md.INDENT),
          // Before `defaultKeymap`, whose Shift+Enter inserts a blank line: the
          // first keymap to answer wins. Enter and Backspace are `markdown()`'s
          // own pair, bound HERE at high precedence instead of by `addKeymap`:
          // the Enter is the app's own (markdownCommands.js says why).
          keymap.of([{ key: "Shift-Enter", run: insertNewline }]),
          Prec.high(
            keymap.of([
              { key: "Enter", run: md.newlineInMarkup },
              { key: "Backspace", run: deleteMarkupBackward },
            ]),
          ),
          // The formatting commands, bound from the SAME registry the shell
          // and the settings screen read (`services/commands.js`), so a
          // rebinding reaches the editor with nothing to keep in sync.
          formatting.of(formattingKeymap($bound)),
          // Before `defaultKeymap`, so Ctrl+F inside the editor is the note's
          // own search; the app-wide Ctrl+F yields to whatever answered closer.
          keymap.of([...searchKeymap]),
          // `markdownLanguage`, not the commonmark default: it understands task
          // lists and strikethrough. No `codeLanguages`: per-language highlighting
          // would drag in ~110 parsers (principle 4); a code block still reads
          // as code, just not colourised.
          markdown({ base: markdownLanguage, addKeymap: false }),
          markdownPreview,
          // Tables as grids, edited in place. The field that says which cell is
          // current comes first: the widget dispatches into it, the commands
          // read it (services/tableEditing.js).
          activeCell,
          noteTables({ shows: () => tables, layout: () => tableLayout }),
          // Folding by SECTION: the chevron beside a heading folds up to the
          // next heading of the same or higher level (the ranges are
          // `markdown()`'s own). The markers carry a class instead of the
          // default glyphs so `editor.css` can draw and turn ONE chevron.
          codeFolding({ placeholderText: "…" }),
          // What each foldable line IS, written on the gutter's own element
          // so the chevron can land on the item's first line whatever that
          // line is — a heading opens with air and reads at its own size, a
          // bullet reads at the note's (services/foldLines.js).
          foldLineClasses,
          foldGutter({
            markerDOM(open) {
              const mark = document.createElement("span");
              mark.className = `cm-fold-marker${open ? " cm-fold-marker--open" : ""}`;
              mark.textContent = "›";
              return mark;
            },
          }),
          ]),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          // The notebook's files, drawn in the note. Built with its answers
          // rather than importing them, so the plugin is testable without a
          // bridge. The closures read the props on every call, which lets the
          // notebook be reopened under a live editor.
          fileEmbeds({
            url: (address) => assetUrl(root, address, version),
            open: (address) => onOpenFile?.(address),
            openNote: (title) => onOpenNote?.(title),
            zoom: (address) => onZoomImage?.(address),
            icon: fileIcon,
            shows: (kind) => (kind === "note" ? wikiLinks : embeds),
          }),
          // What `[[` offers while typed. `autocompletion()` installs its own
          // keymap at high precedence. Only the halves switched on are offered:
          // with both off, `[[` is two characters.
          autocompletion({
            override: [
              referenceCompletions({
                notes: (query) => (wikiLinks ? references.notes?.(query) : []),
                files: (query) => (embeds ? references.files?.(query) : []),
              }),
            ],
          }),
          // WHERE THE PANEL MAY BE, and it has to be told: CodeMirror's own
          // answer is `documentElement.clientHeight`, which on Android includes
          // the keyboard. `pageSpace` subtracts `--app-keyboard` in the
          // coordinates a fixed panel is placed in. See docs/platform-gotchas.md#android
          tooltips({ tooltipSpace: () => pageSpace() }),
          // Pairs that close themselves. After the completion, so its Backspace
          // and keymap are already in place, and in front of CodeMirror's own
          // bracket handler (the module says why). A plain field gets the
          // bracket half only.
          plain ? plainAutoClose : autoClose,
          // The middle button pastes the primary selection on Linux; here it
          // means nothing (the module says why). Every field, plain or not.
          blockMiddlePaste,
          // The keyboard's own help, ON: CodeMirror ships spellcheck/autocorrect/
          // autocapitalize off, the wrong defaults for a notebook. On Android
          // they decide whether Gboard's suggestion strip appears at all, and a
          // false `spellcheck` silences autocorrect too. See docs/platform-gotchas.md#android
          EditorView.contentAttributes.of({
            autocapitalize: "sentences",
            autocorrect: "on",
            spellcheck: "true",
          }),
          EditorView.lineWrapping,
          // Air under the cursor when the editor scrolls to it: on a phone the
          // typed line would otherwise sit flush against the keyboard. In px
          // because the facet is; roughly two lines at the default note size.
          EditorView.cursorScrollMargin.of({ x: 0, y: 40 }),
          // …and the scroll that margin is measured against, which the shell's
          // own layout keeps out of CodeMirror's reach (services/caretScroll.js).
          keepCaretInView,
          placeholderExt(placeholder),
          editable.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((update) => {
            // Two questions of one listener. The selection first, because it
            // moves on far more transactions than the document changes on —
            // every arrow key is one — and it is cheap to answer.
            if (update.selectionSet || update.docChanged) {
              const has = !update.state.selection.main.empty;
              if (has !== lastSelected) {
                lastSelected = has;
                onSelection?.(has);
              }
            }
            if (!plain && (update.selectionSet || update.docChanged || update.transactions.some((tr) => tr.effects.length))) {
              const status = tableStatus(update.state);
              const key = status ? status.header : null;
              if (key !== lastTable) {
                lastTable = key;
                onTable?.(status);
              }
            }
            if (!update.docChanged) return;
            lastEmitted = update.state.doc.toString();
            onChange?.(lastEmitted);
          }),
        ],
      }),
    });
  });

  // The library changed elsewhere in the app: redraw what this note is
  // showing, and let the webview ask for the files again.
  $effect(() => {
    version;
    view?.dispatch({ effects: refreshEmbeds.of(null) });
  });

  // The switch in Settings reaches the open note: the field reads the prop
  // through its closure, and this asks it to look again.
  $effect(() => {
    tables;
    tableLayout;
    if (!plain) view?.dispatch({ effects: refreshTables.of(null) });
  });

  onDestroy(() => view?.destroy());

  /// Opens the find/replace panel from outside (the page ⋮, the canvas menu).
  /// One panel: CodeMirror shows the replace fields whenever the document is
  /// editable, so a read-only note simply gets the find half.
  export function openFind() {
    if (!view) return;
    view.focus();
    openSearchPanel(view);
  }

  /// Runs a command by its registry id — the formatting panel's door; a chord
  /// comes through the keymap to the same function. Focus first, or the note
  /// would not scroll to what changed — unless the focus is in a TABLE CELL,
  /// which is the editor's DOM but not its content element.
  export function run(id) {
    const command = EDITOR_COMMANDS[id];
    if (!view || !command) return false;
    if (!inCell()) view.focus();
    return command(view);
  }

  /// Whether the focus is inside a table widget of this editor.
  function inCell() {
    const active = view?.dom.ownerDocument.activeElement;
    return !!active?.closest?.(".cm-md-table") && view.dom.contains(active);
  }

  /// Writes text where the cursor is — how a picture chosen in the library
  /// lands. The selection is replaced, like a paste, and undoable like one.
  export function insert(text) {
    if (!view || !text) return;
    view.focus();
    view.dispatch(view.state.replaceSelection(text));
  }

  /// Puts the cursor in the note's BODY, at the end: a new note is opened to
  /// WRITE in, and a title is a name you give something once it exists.
  export function focusBody() {
    if (!view) return;
    view.focus();
    view.dispatch({ selection: { anchor: view.state.doc.length } });
  }

  /// The same panel, with the cursor already in the replace field — which is
  /// the only difference between "find" and "replace" as questions.
  export function openReplace() {
    openFind();
    // After the panel is in the DOM: it is created by the dispatch above.
    queueMicrotask(() => {
      const field = view?.dom.querySelector(`.editor-search input[name="${REPLACE_FIELD}"]`);
      field?.focus();
      field?.select?.();
    });
  }

  // A rebinding reaches the open editor without recreating it. A plain field
  // never installed the compartment, so there is nothing to reconfigure.
  $effect(() => {
    const keys = formattingKeymap($bound);
    if (!plain) view?.dispatch({ effects: formatting.reconfigure(keys) });
  });

  // Read-only follows the prop, which flips as soon as the note has loaded.
  $effect(() => {
    const ro = readOnly;
    view?.dispatch({
      effects: editable.reconfigure(EditorState.readOnly.of(ro)),
    });
  });

  // A value that arrives from outside (another note opened, the file reloaded
  // from disk) replaces the document. Our own echo is ignored: re-setting it
  // would throw the cursor to the start mid-typing.
  $effect(() => {
    const incoming = value;
    if (!view || incoming === lastEmitted) return;
    if (incoming === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: incoming },
    });
  });
</script>

<div class="editor" class:editor--plain={plain} bind:this={host}></div>
