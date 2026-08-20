<script>
  // The CodeMirror instance, wrapped so the rest of the app never imports it.
  //
  // Everything above this file talks in `value` and `onChange`, the way it
  // did when this was a `<textarea>` — which is what let the note editor keep
  // its auto-save untouched when the engine changed underneath.
  import { onDestroy, onMount } from "svelte";
  import { Compartment, EditorState } from "@codemirror/state";
  import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
  import {
    defaultKeymap,
    history,
    historyKeymap,
    insertNewline,
  } from "@codemirror/commands";
  import { indentUnit } from "@codemirror/language";
  // Find and replace inside the open note (2026-08-17). CodeMirror's own
  // panel: it is the same shape VSCode's is — a field, a replace field, and
  // the match count — and reusing it means the app is not maintaining a
  // second search engine for one screen.
  import {
    highlightSelectionMatches,
    openSearchPanel,
    search,
    searchKeymap,
  } from "@codemirror/search";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { markdownPreview } from "../services/markdown.js";
  import { autocompletion } from "@codemirror/autocomplete";
  import { autoClose, plainAutoClose } from "../services/autoClose.js";
  import { keepCaretInView } from "../services/caretScroll.js";
  import { fileEmbeds, refreshEmbeds } from "../services/embeds.js";
  import { fromNotebook, referenceCompletions } from "../services/linkComplete.js";
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
    /// A plain-text field rather than a note (the task description,
    /// 2026-08-19): no Markdown, no search panel, no formatting chords — but
    /// the SAME `[[` language, because a reference to a note or a file means
    /// the same thing wherever it is written (principle 7). Only the brackets
    /// auto-close here; the Markdown marks stay ordinary characters in a
    /// field nothing renders.
    plain = false,
    /// What this notebook draws inside a note (App Functions, 2026-08-20).
    /// Both default to on: a component asked for nothing behaves the way the
    /// app ships. They are read by the extensions through closures, so a
    /// switch flipped in Settings reaches the open note on its next
    /// transaction rather than needing the editor torn down.
    wikiLinks = true,
    embeds = true,
  } = $props();

  let host;
  let view = null;
  /// Extensions are baked in when the state is created, so anything that
  /// changes later needs a compartment to be reconfigurable.
  ///
  /// This is not a detail: without it the editor was created while the note
  /// was still loading — `readOnly || loading` — and stayed read-only
  /// forever. The file rendered beautifully and refused every keystroke.
  const editable = new Compartment();
  /// The formatting keymap lives in a compartment because the chords are the
  /// user's to change: rebinding one in Settings reconfigures this without
  /// tearing the editor down and losing the cursor.
  const formatting = new Compartment();

  /// Which editor command each id in the registry runs.
  ///
  /// The table itself is in `markdownCommands.js`, where the formatting panel
  /// reads it too. Only `note.replace` is added here: it opens a panel, which
  /// needs the view this component owns.
  const EDITOR_COMMANDS = {
    ...md.EDITOR_COMMANDS,
    "note.replace": () => {
      openReplace();
      return true;
    },
  };

  /// The registry's bindings, in CodeMirror's dialect.
  ///
  /// `preventDefault` on every one: these chords belong to the editor while
  /// the cursor is in it, and the shell's own table stands down for anything
  /// already answered (`shortcuts.js`). That is what lets Ctrl+K be a link
  /// here and the search everywhere else.
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

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // Everything a NOTE is and a plain field is not: Markdown and its
          // preview, the find/replace panel, the formatting chords, the list
          // indentation. What stays below the split is the ground every text
          // field shares — and the `[[` references, which mean the same thing
          // wherever they are written.
          ...(plain ? [] : [
          // The panel sits at the TOP, where the document's own header is —
          // at the bottom it lands on the window edge, under the status of
          // nothing.
          search({ top: true }),
          highlightSelectionMatches(),
          // `searchKeymap` before the rest so Ctrl+F inside the editor is the
          // note's own search: the app-wide Ctrl+F (services/shortcuts.js)
          // yields to whatever answered closer to the keyboard.
          // Indentation, as the user asked for it (2026-08-18). Two spaces
          // per level (`INDENT`, and the reason is written there), and Tab
          // indents the LINE from wherever the cursor sits in it rather than
          // inserting a tab character where it stands.
          //
          // The known cost of claiming Tab, and it is accepted knowingly: Tab
          // no longer walks out of the editor. Every other way out — the
          // shortcuts, the mouse, the page menu — still works, and an editor
          // in which Tab cannot indent a list is the worse trade for a notes
          // app.
          indentUnit.of(md.INDENT),
          // Before `defaultKeymap`, whose Shift+Enter inserts a blank line:
          // the first keymap to answer wins.
          //
          // Enter is deliberately NOT here. `markdown()` binds it at high
          // precedence already (`markdownKeymap`), and it does both things
          // asked for — keeps the previous line's indentation and carries the
          // list marker on. Binding it a second time here would be a second
          // source for one behaviour. Shift+Enter is the way OUT of both, and
          // that one nobody had.
          //
          // Tab and Shift+Tab used to be here too. They moved into the
          // registry (`md.indent` / `md.outdent`, 2026-08-19) the moment the
          // formatting panel grew a button for them: a button, a chord and a
          // settings row all describing one behaviour is exactly what the
          // registry exists to keep from drifting.
          keymap.of([{ key: "Shift-Enter", run: insertNewline }]),
          // The formatting commands, bound from the SAME registry the shell
          // and the settings screen read (`services/commands.js`), so a
          // rebinding reaches the editor with nothing to keep in sync.
          formatting.of(formattingKeymap($bound)),
          keymap.of([...searchKeymap]),
          // `markdownLanguage` rather than the commonmark default: it is the
          // one that understands task lists and strikethrough, which a note
          // of the day uses constantly.
          //
          // No `codeLanguages`: highlighting a fenced block per language
          // would drag in ~110 parsers for an app whose notes are the small
          // ones of the day (spec 5, principle 4). A code block still reads
          // as code — monospace, set apart — it just is not colourised.
          markdown({ base: markdownLanguage }),
          markdownPreview,
          ]),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          // The notebook's files, drawn in the note (2026-08-19). Built with
          // its three answers rather than importing them, so the plugin is
          // testable without a bridge and the editor keeps knowing only about
          // text. The closures read the props on every call, which is what
          // lets the notebook be reopened under a live editor.
          fileEmbeds({
            url: (address) => assetUrl(root, address, version),
            open: (address) => onOpenFile?.(address),
            openNote: (title) => onOpenNote?.(title),
            zoom: (address) => onZoomImage?.(address),
            icon: fileIcon,
            shows: (kind) => (kind === "note" ? wikiLinks : embeds),
          }),
          // What `[[` offers while it is typed (2026-08-19). Its keymap is
          // installed at high precedence by `autocompletion()` itself, which
          // is what puts ArrowDown/Enter on the list while it is open and
          // gives them straight back to the document when it is not.
          // Only the halves that are switched on are offered: with WikiLinks
          // off, `[[` has nothing to say about notes, and with both off it
          // says nothing at all and the brackets are two characters.
          autocompletion({
            override: [
              referenceCompletions({
                notes: (query) => (wikiLinks ? references.notes?.(query) : []),
                files: (query) => (embeds ? references.files?.(query) : []),
              }),
            ],
          }),
          // Pairs that close themselves (2026-08-19). After the completion so
          // its Backspace and its keymap are the ones already in place, and
          // internally in front of CodeMirror's own bracket handler — the
          // reason is written at the top of the module. A plain field gets
          // the bracket half only (`plainAutoClose` carries the why).
          plain ? plainAutoClose : autoClose,
          // The keyboard's own help, switched back ON (2026-08-20).
          // CodeMirror ships `spellcheck="false" autocorrect="off"
          // autocapitalize="off"` on its content element — the right defaults
          // for a code editor and the wrong ones for a notebook. On Android
          // those three attributes are the whole conversation with Gboard:
          // they decide whether a sentence is capitalised, whether a typo is
          // fixed, and whether the suggestion strip appears at all. With them
          // off, writing a note felt like nothing else on the phone (user
          // report, 2026-08-20) — the keyboard was not misbehaving, it had
          // been told to keep quiet.
          //
          // `spellcheck` is the one that carries the strip, which is why it is
          // here even though no red underline is wanted for its own sake:
          // Chrome turns a false spellcheck into the IME's no-suggestions
          // flag, and that silences autocorrect as well, `autocorrect="on"`
          // or not.
          EditorView.contentAttributes.of({
            autocapitalize: "sentences",
            autocorrect: "on",
            spellcheck: "true",
          }),
          EditorView.lineWrapping,
          // Air under the cursor when the editor scrolls to it (2026-08-20).
          // Without it the line being typed lands flush against the bottom
          // edge — which, on a phone, is flush against the top of the
          // keyboard, with the next line already out of sight. A native
          // editor always shows a little of what comes after the caret. In
          // px because the facet is measured in them; roughly two lines at
          // the default note size.
          EditorView.cursorScrollMargin.of({ x: 0, y: 40 }),
          // …and the scroll that margin is measured against, which the shell's
          // own layout keeps out of CodeMirror's reach (services/caretScroll.js).
          keepCaretInView,
          placeholderExt(placeholder),
          editable.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((update) => {
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

  onDestroy(() => view?.destroy());

  /// Opens the find/replace panel from outside — the page ⋮ and the canvas
  /// menu ask for it by name (2026-08-17).
  ///
  /// There is one panel: the replace fields are part of it, and CodeMirror
  /// shows them whenever the document is editable. So "Find" and "Replace" are
  /// the same door, and a read-only note simply gets the find half.
  export function openFind() {
    if (!view) return;
    view.focus();
    openSearchPanel(view);
  }

  /// Runs a command by the id the registry knows it as — the door the
  /// formatting panel comes through, while a chord comes through the keymap.
  /// Both end at the same function, which is what keeps a button and its
  /// tooltip from ever describing something the key does differently.
  ///
  /// Focus first: an editor command edits around the cursor, and clicking a
  /// button took the focus away from it. Without this the selection is still
  /// there but the caret is not, and the note would not scroll to what just
  /// changed.
  export function run(id) {
    const command = EDITOR_COMMANDS[id];
    if (!view || !command) return false;
    view.focus();
    return command(view);
  }

  /// Writes text where the cursor is — how a picture chosen in the library
  /// lands in the note (2026-08-18). The selection is replaced, which is what
  /// every other editor does with a paste, and it is undoable like one.
  export function insert(text) {
    if (!view || !text) return;
    view.focus();
    view.dispatch(view.state.replaceSelection(text));
  }

  /// Puts the cursor in the note's BODY, at the end of what is there.
  ///
  /// For a note that was just created (the compact shell's "new note", user
  /// call 2026-08-18): the wireframe drew the caret in the title, and the
  /// decision went the other way — a note is opened to WRITE in, and a title
  /// is a name you give something once it exists. Naming first asks for the
  /// one thing the writer does not know yet.
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
      const field = view?.dom.querySelector('.cm-search input[name="replace"]');
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
