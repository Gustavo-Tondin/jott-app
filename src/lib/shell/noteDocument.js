// The open note's document actions, owned by the shell because each one
// changes what the tab points at. Plain JS: the shell hands in GETTERS for
// what it holds (`view`, `note`, `editor`) and setters for what changes, so
// every read here sees the shell's current value and nothing is copied.
import { api } from "../services/api.js";
import { askConfirm, askName, DELETING } from "../services/dialog.js";
import { importBrought } from "../services/assets.js";
import { embedMarkdown } from "../services/embeds.js";
import { bannerOf } from "../services/noteActions.js";
import { cleanTagName } from "../services/taskFields.js";
import { S } from "../services/strings.js";

/// The host, which is the part worth reading — and the whole address when it
/// will not parse, because the question still has to say what it is doing.
export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/// - `view()` / `note()` / `editor()` — what the shell shows right now.
/// - `setNote(next)` — the open note's record, after a write.
/// - `readOnly()` — whether the notebook takes writes at all.
/// - `change(run, then)` — the shell's recorded action (`services/act.js`).
/// - `fail` / `reload` / `refreshNotebook` — the shell's error and refresh.
/// - `replaceTabView(from, to)` / `closeActiveTab()` / `goTo(view)` — the
///   tab that follows the file.
/// - `showNote(path, folder)` — opens a note; `openSearchAt(title)` — the
///   search box, at a title, when a link is ambiguous.
/// - `picking()` / `pickImage(purpose)` — the image picker: what it was
///   opened for (`"banner"` or `"body"`), and opening it (`null` closes).
export function makeNoteDocument({
  view,
  note,
  setNote,
  editor,
  readOnly,
  change,
  fail,
  reload,
  refreshNotebook,
  replaceTabView,
  closeActiveTab,
  goTo,
  showNote,
  openSearchAt,
  picking,
  pickImage,
}) {
  /// Anything still being typed goes out first: renaming or deleting
  /// underneath a pending write would lose it.
  const noteAction = (fn) =>
    change(async () => {
      await editor()?.flushPending();
      await fn();
    }, reload);

  const toggleNotePin = () =>
    noteAction(async () => {
      const { folder, path } = view();
      const pinned = !note().pinned;
      await api.setNotePinned(folder, path, pinned);
      setNote({ ...note(), pinned });
    });

  /// Replaces the open note's tags — its subjects, the `tags:` property.
  /// One line of the note's own file, so it goes through the same flush the
  /// banner does.
  const setNoteTags = (next) =>
    noteAction(async () => {
      const tags = next.map(cleanTagName).filter(Boolean);
      await api.setNoteTags(view().folder, view().path, tags);
      setNote({ ...note(), tags });
    });

  /// A tag typed into the note's picker that the catalogue does not know:
  /// saved there first (so the next picker offers it), then applied.
  async function createNoteTag(name) {
    try {
      await api.setTag(name, null);
      await setNoteTags([...(note()?.tags ?? []), name]);
      refreshNotebook();
    } catch (e) {
      fail(e);
    }
  }

  /// Hangs a banner on the open note, or takes it off with `null`.
  ///
  /// It writes ONE line of the note's own file (`core/src/note.rs`), so it
  /// goes through the same flush the other document actions do: a pending body
  /// write and a banner write both rewrite the file, and the last one there
  /// would win.
  const setNoteBanner = (value) =>
    noteAction(async () => {
      await api.setNoteBanner(view().folder, view().path, value);
      setNote({ ...note(), banner: bannerOf(value) });
    });

  /// What a formatting button asks for. All but one go straight to the editor,
  /// which owns the cursor; the paperclip asks the SHELL for a file, because
  /// the library is the notebook's and the editor only ever speaks text — the
  /// same split the picker keeps.
  const runFormat = (id) => {
    if (id === "md.attach") pickImage("body");
    else editor()?.run(id);
  };

  /// What the image picker does with what was chosen, by what it was opened
  /// for. Closing it is the same either way.
  function useImage(address) {
    const purpose = picking();
    pickImage(null);
    if (purpose === "banner") setNoteBanner(address);
    else editor()?.insert(embedMarkdown(address));
  }

  /// Fetches a picture that is only on the web, having asked first.
  ///
  /// The one thing this app does that leaves the machine, so it says which
  /// host it will contact before doing it (principle 9) — until the person
  /// says to stop asking, which is a setting of the notebook and not of the
  /// session. Answers with the address it took, or `null`.
  async function fetchRemoteImage(url) {
    const ok = await askConfirm(S.downloadImageTitle, {
      detail: S.downloadImageBody,
      code: hostOf(url),
      danger: S.downloadImageConfirm,
      remember: "confirmImageDownloads",
    });
    if (!ok) return null;
    try {
      const address = await api.importAssetFromUrl(url);
      reload();
      return address;
    } catch (e) {
      fail(e);
      return null;
    }
  }

  /// Files the user brought into the open note — pasted, or dropped on it.
  /// They go into the notebook's library like any other file, and the note
  /// gets the markdown for them where the caret is.
  ///
  /// Importing here rather than in the editor is the same split the picker
  /// keeps: the editor writes text, and what an address MEANS is the shell's
  /// question. One markdown line per file, each on its own line, because two
  /// pictures pasted at once are two pictures and not a sentence.
  async function addFilesToNote(brought) {
    if (readOnly()) return;
    if (brought?.files?.length || brought?.paths?.length) {
      try {
        for (const address of await importBrought(brought)) {
          editor()?.insert(`${embedMarkdown(address)}\n`);
        }
      } catch (e) {
        fail(e);
      }
      return;
    }
    // Nothing local, but an address on the web: a picture copied from a page.
    // Drawing it means FETCHING it, which is the one thing this app does that
    // leaves the machine — so it is asked for, until the person says to stop
    // asking (principle 9, and `confirmImageDownloads`).
    if (brought?.remote) {
      const address = await fetchRemoteImage(brought.remote);
      if (address) editor()?.insert(`${embedMarkdown(address)}\n`);
      return;
    }
    // The desktop said it was handing over a file and handed over something
    // this app cannot read. Saying WHAT it was beats doing nothing at all —
    // it is the difference between a bug report and a mystery.
    fail(S.noFileInGesture(brought?.types ?? []));
  }

  /// Opens the note a `[[link]]` names.
  ///
  /// A link carries a TITLE, so a title has to be turned into a note — and
  /// the notebook's own search is what already knows every note there is.
  /// Exact matches only: `[[Ideias]]` means the note called Ideias, not every
  /// note with the word in it.
  ///
  /// Two of them is not a guess the app gets to make (see docs/historico.md):
  /// the search box opens at that title and the person picks. None of them is
  /// worth saying — a link that names nothing looks exactly like one that
  /// works.
  async function openNoteByTitle(title) {
    const wanted = String(title ?? "").trim().toLowerCase();
    if (!wanted) return;
    try {
      const found = (await api.search(title, 50))?.notes ?? [];
      const exact = found.filter((it) => it.title.trim().toLowerCase() === wanted);
      if (exact.length === 1) showNote(exact[0].path, exact[0].folder);
      else if (exact.length === 0) fail(S.noteNotFound(title));
      else openSearchAt(title);
    } catch (e) {
      fail(e);
    }
  }

  const renameCurrentNote = () =>
    noteAction(async () => {
      const { title } = note();
      const next = await askName(S.promptRenameNote(title), title);
      if (!next || next.trim() === title) return;
      const { folder, path } = view();
      const moved = await api.renameNote(folder, path, next.trim());
      // The tab follows the file rather than pointing at a name that is gone.
      replaceTabView({ kind: "note", folder, path }, { kind: "note", folder, path: moved });
    });

  const deleteCurrentNote = () =>
    noteAction(async () => {
      if (!(await askConfirm(S.confirmDeleteNote(note().title), DELETING))) return;
      await api.deleteNote(view().folder, view().path);
      closeActiveTab();
    });

  /// Moves the open note, and follows it: the tab points at an address, and
  /// the address just changed.
  const moveOpenNote = (space, into) =>
    noteAction(async () => {
      const landed = await api.moveNoteToSpace(view().folder, view().path, space, into);
      goTo({ kind: "note", folder: space, path: landed });
    });

  return {
    noteAction,
    toggleNotePin,
    setNoteTags,
    createNoteTag,
    setNoteBanner,
    runFormat,
    useImage,
    addFilesToNote,
    fetchRemoteImage,
    openNoteByTitle,
    renameCurrentNote,
    deleteCurrentNote,
    moveOpenNote,
  };
}
