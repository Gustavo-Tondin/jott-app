// What the notes board shows at one place in the tree.
//
// The wireframes ("Notes screen - default", "Space Notes") draw two kinds of
// card side by side: a NOTE, and a FOLDER of notes — a coloured card with the
// notes it holds drawn small inside it. This decides which is which, so the
// screen only has to draw them.
//
// The one rule that is not obvious, and the reason this is a file with tests:
// **the inbox is not a folder card**. Every loose note the app files goes to
// `Inbox/` (spec 5), so a board that made a card of every folder would show
// one card called Inbox with everything in it — the board would have stopped
// being a board. At the root, the inbox's notes ARE the loose notes. Anywhere
// else the rule is the plain one: the notes of this folder, and a card for
// each folder directly inside it.

/// How many notes a folder card draws inside itself. Four, as the wireframe
/// draws — two rows of two, which is what fits the card's height without the
/// mini cards becoming unreadable slivers.
export const GROUP_PREVIEW = 4;

/// The parent of a folder address, `""` at the top level.
const parentOf = (path) => {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
};

/// The last segment of a folder address — what the card is called.
const leafOf = (path) => path.slice(path.lastIndexOf("/") + 1);

/// The board at `current` (`""` or null = the space's root).
///
/// - `notes`   — every note of the space, as the bridge lists them
///               (`{ path, title, folder, preview, pinned, banner }`);
/// - `folders` — every folder of the space, deep, as `note_folders` gives them:
///               `{ path, color, pinned }`, the colour and the pin coming from
///               the space's own config (2026-08-19);
/// - `inbox`   — the name of the space's inbox folder.
///
/// Returns `{ cards, groups, parent }`: the notes to draw, the folder cards to
/// draw, and where "up" goes (null at the root). A **pinned** folder card comes
/// first, the same rule a pinned note follows.
export function board(notes = [], folders = [], current = "", inbox = "Inbox") {
  const here = current ?? "";
  const inboxName = inbox || "";

  // At the root the inbox is not a place you go into — it is where loose notes
  // already are.
  const loose = (note) =>
    here === "" ? note.folder === "" || note.folder === inboxName : note.folder === here;

  const groups = folders
    .filter(
      (folder) =>
        parentOf(folder.path) === here && !(here === "" && folder.path === inboxName),
    )
    .map((folder) => ({
      path: folder.path,
      name: leafOf(folder.path),
      color: folder.color ?? null,
      pinned: !!folder.pinned,
      /// The notes directly inside it, for the small cards.
      notes: notes.filter((note) => note.folder === folder.path).slice(0, GROUP_PREVIEW),
      /// Everything below it, however deep — the number on the card has to
      /// mean "notes in there", not "notes in the first level of there".
      count: notes.filter(
        (note) =>
          note.folder === folder.path || note.folder.startsWith(`${folder.path}/`),
      ).length,
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return {
    cards: notes.filter(loose),
    groups,
    parent: here === "" ? null : parentOf(here),
  };
}
