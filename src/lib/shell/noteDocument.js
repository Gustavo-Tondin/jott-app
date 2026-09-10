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

/// - `view()` / `note()` / `editor()` — what the shell shows; `setNote(next)`.
/// - `readOnly()`; `change(run, then)` — the recorded action (`services/act.js`).
/// - `fail` / `reload` / `refreshNotebook` — the shell's error and refresh.
/// - `replaceTabView(from, to)` / `closeActiveTab()` / `goTo(view)` — the tab follows the file.
/// - `showNote(path, folder)`; `openSearchAt(title)` — when a link is ambiguous.
/// - `picking()` / `pickImage(purpose)` — `"banner"` | `"body"`; `null` closes.
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

  /// Hangs a banner on the open note, or takes it off with `null`. It writes
  /// ONE line of the note's file, so it takes the same flush as the body.
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
  /// for. Closing it is the same either way. A FUNCTION is a caller outside
  /// the open note (a card's banner) handed the address.
  function useImage(address) {
    const purpose = picking();
    pickImage(null);
    if (typeof purpose === "function") purpose(address);
    else if (purpose === "banner") setNoteBanner(address);
    else editor()?.insert(embedMarkdown(address));
  }

  /// Fetches a picture that is only on the web, having asked first — the one
  /// thing this app does that leaves the machine (principle 9). `remember` is
  /// a notebook setting. Answers with the address it took, or `null`.
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

  /// Files brought into the open note go into the library, and the note gets
  /// the markdown where the caret is, one line per file. Importing here, not
  /// in the editor: the editor writes text; what an address MEANS is the shell's.
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
    // Nothing local, but an address on the web: fetched, after asking.
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

  /// Opens the note a `[[link]]` names. A link carries a TITLE, so the search
  /// finds the note; exact matches only. Two matches is not a guess the app
  /// makes — the search box opens at that title. None: a message, because a
  /// dead link looks exactly like a live one.
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

  /// `to` is the new name when the caller already has one (the title's own
  /// field); without it the name is asked for. A menu row passes its gesture,
  /// hence the type test.
  const renameCurrentNote = (to) =>
    noteAction(async () => {
      const { title } = note();
      const next =
        typeof to === "string" ? to : await askName(S.promptRenameNote(title), title);
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
