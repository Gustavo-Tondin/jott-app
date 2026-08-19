<script>
  // One note, open for editing.
  //
  // Auto-saves like the task inspector, and for the same reason the user gave
  // when the Save button was removed: an edit you have to remember to confirm
  // is an edit you lose. The mechanics are the same too — a captured target,
  // a flush on close, and a baseline that only advances after the write
  // lands. See TaskInspector for why each of those exists.
  import { onDestroy } from "svelte";
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import Editor from "./Editor.svelte";

  import { carriesFiles, readGesture, readPaste } from "../services/assets.js";

  let {
    folder,
    path,
    readOnly = false,
    onSaved,
    onError,
    onLoaded,
    onFiles,
    onOpenFile,
    onOpenNote,
    onZoomImage,
    root = null,
    saveDelay = 500,
  } = $props();

  let body = $state("");
  let loading = $state(true);

  // Plain, not reactive: none of this should re-render anything.
  let slot = null;
  let baseline = "";
  let pending = null;
  let timer = null;

  $effect(() => {
    folder;
    path;
    // Whatever was typed into the previous note goes out first, addressed to
    // that note, before this one replaces it.
    flush();
    load(folder, path);
  });

  onDestroy(() => flush());

  async function load(atFolder, atPath) {
    loading = true;
    try {
      const note = await api.readNote(atFolder, atPath);
      slot = { folder: atFolder, path: atPath };
      body = note.body;
      baseline = note.body;
      // The shell owns the title and the document actions — they belong to
      // the page header, above the tabs, not to a second bar inside the page.
      // The banner travels with the note but is NOT part of the body: it is
      // the shell that draws it, above this editor (components/NoteBanner),
      // the same way the title and the pin are the page header's.
      onLoaded?.({ pinned: note.pinned, title: note.title, banner: note.banner ?? null });
    } catch (e) {
      onError?.(e);
    } finally {
      loading = false;
    }
  }

  // The auto-save. Comparing against the baseline is what tells a real edit
  // apart from `load` having just filled the field.
  $effect(() => {
    const snapshot = body;
    if (readOnly || loading || snapshot === baseline) return;

    pending = { target: slot, body: snapshot };
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, saveDelay);
  });

  function flush() {
    if (!pending) return Promise.resolve();
    if (timer) clearTimeout(timer);
    timer = null;
    return write();
  }

  async function write() {
    const job = pending;
    pending = null;
    timer = null;
    if (!job?.target) return;

    try {
      await api.writeNote(job.target.folder, job.target.path, job.body);
      // Only after it lands, and only if we are still on the same note: a
      // failed write must be retried by the next edit, not counted as saved.
      if (job.target === slot) baseline = job.body;
      onSaved?.();
    } catch (e) {
      onError?.(e);
    }
  }

  /// Sends anything still pending, so the shell can rename or delete safely.
  export const flushPending = () => flush();

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

  // ---- files brought into the note (2026-08-19) ----
  //
  // **On the wrapper, and in the CAPTURE phase**, and both halves of that were
  // learned from the running app rather than guessed:
  //
  //   - a file DROPPED on a note lands on this div and not inside the editor
  //     (measured: `drop on div.note-editor__body inEditor=false`). Handlers
  //     inside CodeMirror never saw it, which is why dragging did nothing at
  //     all. This div is the whole area a person aims at.
  //   - capture, because CodeMirror handles a paste itself, and by the time
  //     the event bubbles back out here it is too late to stop it pasting the
  //     address as text.
  //
  // The reading is asynchronous (`readGesture`), so `preventDefault` happens
  // first: a transfer is only readable while its event is being dispatched.
  function brought(transfer, read) {
    if (readOnly || !onFiles) return false;
    if (!transfer?.files?.length && !carriesFiles(transfer)) return false;
    read(transfer).then(onFiles);
    return true;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="note-editor__body"
  aria-label={S.noteBodyPlaceholder}
  onpastecapture={(e) => brought(e.clipboardData, readPaste) && e.preventDefault()}
  ondropcapture={(e) => brought(e.dataTransfer, readGesture) && e.preventDefault()}
  ondragovercapture={(e) => {
    // Saying "I take these" is the only way the drop event arrives at all.
    if (!readOnly && carriesFiles(e.dataTransfer)) e.preventDefault();
  }}
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
    {root}
  />
</div>
