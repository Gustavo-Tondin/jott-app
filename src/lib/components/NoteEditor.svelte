<script>
  // One note, open for editing.
  //
  // Auto-saves like the task inspector, and for the same reason the user gave
  // when the Save button was removed: an edit you have to remember to confirm
  // is an edit you lose. The mechanics ARE the inspector's — the shared
  // engine in services/autosave.js, which carries the why of each rule.
  import { onDestroy, untrack } from "svelte";
  import { api } from "../services/api.js";
  import { autosave } from "../services/autosave.js";
  import { S } from "../services/strings.js";
  import Editor from "./Editor.svelte";
  import { acceptsFiles } from "../actions/acceptsFiles.js";

  let {
    folder,
    path,
    readOnly = false,
    onSaved,
    onError,
    onLoaded,
    /// `({files, paths, remote, types}) => void` — the user brought files into
    /// the note, by pasting or by dropping them on it. What that means is the
    /// shell's to decide (`services/gesture.js` says what each field is).
    onFiles,
    onOpenFile,
    onOpenNote,
    onZoomImage,
    /// `(hasSelection) => void`, passed straight through (2026-08-21). This
    /// component owns the file; the editor owns what is happening inside it.
    onSelection,
    root = null,
    version = 0,
    /// Bumped by the shell when THIS note's file was written by somebody
    /// else (a sync, another program). Clean, the editor follows the disk;
    /// dirty, the typing wins the screen and the next save keeps the other
    /// version as a conflict copy first — nothing is lost either way.
    externalRevision = 0,
    /// The other version was kept as a conflict copy: the shell re-reads
    /// its list of conflicts.
    onConflictKept,
    saveDelay = 500,
    /// What a note may hold in this notebook (App Functions, 2026-08-20).
    /// Passed straight through: this component owns the file, the editor owns
    /// what is drawn in it.
    wikiLinks = true,
    embeds = true,
    tables = true,
    tableLayout = "",
    /// `({header}) | null`, passed straight through (2026-08-24).
    onTable,
  } = $props();

  let body = $state("");
  let loading = $state(true);
  /// Somebody else's version reached the disk while there was unsaved
  /// typing here: the next write keeps it beside the note first. Plain,
  /// not state — read at write time, never drawn.
  let keepTheirs = false;
  /// The last text handed to the bridge, landed or not: with the baseline,
  /// what THIS editor put on disk. A disk that reads as either holds nobody
  /// else's work, and the core keeps no copy of it — on a phone's storage the
  /// editor's own save can come back as an outside change.
  let lastWritten = null;

  // The delay is captured once on purpose: a mount-time knob for tests,
  // never changed while the editor lives.
  // svelte-ignore state_referenced_locally
  const saver = autosave({
    delay: saveDelay,
    write: async (target, text) => {
      if (keepTheirs) {
        keepTheirs = false;
        const ours = [...new Set([saver.baseline(), lastWritten].filter((t) => t != null))];
        const kept = await api.keepNoteConflictCopy(target.folder, target.path, ours);
        if (kept) onConflictKept?.();
      }
      lastWritten = text;
      await api.writeNote(target.folder, target.path, text);
      onSaved?.();
    },
    onError: (e) => onError?.(e),
  });

  /// The address last loaded, so a rerun with the same one (a props object
  /// replaced whole, as a test harness does) is not a reload.
  let opened = null;

  $effect(() => {
    const address = `${folder}\u0000${path}`;
    if (address === opened) return;
    opened = address;
    // Whatever was typed into the previous note goes out first, addressed to
    // that note, before this one replaces it.
    saver.flush();
    // A new note starts with nothing selected, and the editor will not say so
    // — its listener only fires on a transaction, and swapping the document
    // is not one it reports as a selection change. Left unsaid, a bar shown
    // "on selection" would still be up over a note nobody has touched.
    onSelection?.(false);
    onTable?.(null);
    keepTheirs = false;
    lastWritten = null;
    load(folder, path);
  });

  // The file changed under the editor. Read untracked: this answers to the
  // revision only, never to what is typed or to the address (above).
  $effect(() => {
    if (!externalRevision) return;
    untrack(() => {
      if (saver.dirty(body)) keepTheirs = true;
      else load(folder, path);
    });
  });

  onDestroy(() => saver.flush());

  /// Whether the editor has moved on from the address a read was made for.
  /// A rename puts the new address here while the read of the old one is
  /// still in flight — and that file is gone, so the read fails. Neither the
  /// answer nor the error is about the file this editor now shows.
  const movedOn = (atFolder, atPath) => atFolder !== folder || atPath !== path;

  async function load(atFolder, atPath) {
    loading = true;
    try {
      const note = await api.readNote(atFolder, atPath);
      if (movedOn(atFolder, atPath)) return;
      saver.open({ folder: atFolder, path: atPath }, note.body);
      body = note.body;
      // The shell owns the title and the document actions — they belong to
      // the page header, above the tabs, not to a second bar inside the page.
      // The banner travels with the note but is NOT part of the body: it is
      // the shell that draws it, above this editor (components/NoteBanner),
      // the same way the title and the pin are the page header's.
      onLoaded?.({
        pinned: note.pinned,
        title: note.title,
        banner: note.banner ?? null,
        created: note.created ?? null,
        tags: note.tags ?? [],
      });
    } catch (e) {
      if (movedOn(atFolder, atPath)) return;
      onError?.(e);
    } finally {
      // The load that owns the screen is the one that owns this flag.
      if (!movedOn(atFolder, atPath)) loading = false;
    }
  }

  // The auto-save. The dirty check is what tells a real edit apart from
  // `load` having just filled the field.
  $effect(() => {
    const snapshot = body;
    if (readOnly || loading || !saver.dirty(snapshot)) return;
    saver.edit(snapshot, snapshot);
  });

  /// Sends anything still pending, so the shell can rename or delete safely.
  export const flushPending = () => saver.flush();

  // The find/replace panel belongs to the editor engine; the shell opens it
  // from the page ⋮ and from the canvas menu, which is why it travels back up
  // through here (2026-08-17).
  let editor = $state(null);
  export const openFind = () => editor?.openFind();
  export const openReplace = () => editor?.openReplace();
  export const focusBody = () => editor?.focusBody();
  /// Writes text at the cursor — the image picker's way in (2026-08-18).
  export const insert = (text) => editor?.insert(text);
  /// The formatting panel's door into the editor: same commands, same ids as
  /// the keymap uses (2026-08-18).
  export const run = (id) => editor?.run(id);

</script>

<!-- The whole area a person aims at: a dropped file lands on this div and
     never inside the editor (measured 2026-08-19), and a paste reaches it by
     capture before CodeMirror can paste the address as text. -->
<div
  class="note-editor__body"
  aria-label={S.noteBodyPlaceholder}
  use:acceptsFiles={{ onFiles, disabled: readOnly, paste: "node" }}
>
  <Editor
    bind:this={editor}
    value={body}
    readOnly={readOnly || loading}
    placeholder={S.noteBodyPlaceholder}
    onChange={(next) => (body = next)}
    {onOpenFile}
    {onOpenNote}
    {onZoomImage}
    {onSelection}
    {root}
    {version}
    {wikiLinks}
    {embeds}
    {tables}
    {tableLayout}
    {onTable}
  />
</div>
