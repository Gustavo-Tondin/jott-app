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
    indentLess,
    indentMore,
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
  import * as md from "../services/markdownCommands.js";
  import { bound } from "../services/shortcuts.js";
  import { toCodeMirror } from "../services/keys.js";

  let { value = "", readOnly = false, placeholder = "", onChange } = $props();

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
          keymap.of([
            { key: "Tab", run: indentMore, shift: indentLess },
            { key: "Shift-Enter", run: insertNewline },
          ]),
          // The formatting commands, bound from the SAME registry the shell
          // and the settings screen read (`services/commands.js`), so a
          // rebinding reaches the editor with nothing to keep in sync.
          formatting.of(formattingKeymap($bound)),
          keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
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
          EditorView.lineWrapping,
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

  // A rebinding reaches the open editor without recreating it.
  $effect(() => {
    const keys = formattingKeymap($bound);
    view?.dispatch({ effects: formatting.reconfigure(keys) });
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

<div class="editor" bind:this={host}></div>
