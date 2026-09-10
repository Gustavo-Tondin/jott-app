// The shell's menus, as pure functions over what the shell knows. The
// `$derived` in App.svelte calls these; nothing here reads state of its own,
// which is what lets a menu be tested without a notebook open.
import { ACCENTS, accentFill } from "../services/accent.js";
import { NOTE_FONT_SIZES } from "../services/themes.js";
import { S } from "../services/strings.js";

/// What can be done to the SCREEN itself — written once and served twice,
/// from the page ⋮ and from a right-click on the empty canvas. Which ones
/// apply is decided by the view, never by the caller.
export function screenActionsOf({
  readOnly,
  isNote,
  hereLabel,
  renamableSpace,
  findHere,
  revealHere,
  renameSpace,
  openReplace,
}) {
  if (readOnly) {
    // Reading is still reading: finding and opening the folder cost nothing.
    return [
      { label: S.findInPlace(hereLabel), run: findHere },
      { label: S.openInFileManager, run: revealHere },
    ];
  }
  const items = [];
  if (renamableSpace) {
    items.push({
      label: S.renameThisSpace,
      run: () => renameSpace(renamableSpace.path, renamableSpace.name),
    });
  }
  items.push({ label: S.openInFileManager, run: revealHere });
  items.push(
    isNote
      ? { label: S.findInNote, run: findHere }
      : { label: S.findInPlace(hereLabel), run: findHere },
  );
  // Replacing is a note's own gesture: a task list is rows in a screen, not
  // a document with a body to rewrite.
  if (isNote) items.push({ label: S.replaceInNote, run: openReplace });
  return items;
}

/// The open note's banner, as one row with the eight colours folded under it.
/// The palette is words here (with the fill each paints with as a dot) and
/// swatches in the block's own popover; the VALUE is the same name either
/// door, which is what keeps the file readable by hand.
export function bannerMenuOf({ banner, setBanner, pickImage }) {
  return {
    label: S.banner,
    items: [
      ...ACCENTS.map((name) => ({
        label: S.colorName(name),
        checked: banner?.value === name,
        swatch: accentFill(name),
        run: () => setBanner(name),
      })),
      { label: S.bannerImage, run: pickImage },
      ...(banner ? [{ label: S.removeBanner, run: () => setBanner(null) }] : []),
    ],
  };
}

/// What an open NOTE can be asked to do — served by the page's ••• and by
/// the ⋮ of the note's own panel. Each item behind a feature is a switch of
/// its own: an item that acts on something the notebook does not have would
/// be a promise the app cannot keep.
export function noteActionsOf({
  readOnly,
  isNote,
  f,
  pinned,
  togglePin,
  rename,
  remove,
  bannerMenu,
  pickImage,
  fontSize,
  setFontSize,
  compact,
  formatting,
  setFormatting,
  formatBarMode,
}) {
  if (readOnly || !isNote) return [];
  const own = [
    ...(f("pinNotes") ? [{ label: pinned ? S.unpin : S.pin, run: togglePin }] : []),
    { label: S.renameNote, run: rename },
    { label: S.deleteNote, run: remove },
    ...(f("banners") ? [bannerMenu] : []),
    ...(f("embeds") ? [{ label: S.insertImage, run: pickImage }] : []),
    // The reading size, where a reader asks for it — on the note itself, not
    // only two screens away in Settings. The same setting either way.
    {
      label: S.noteTextSize,
      items: NOTE_FONT_SIZES.map((size) => ({
        label: size.label(),
        checked: fontSize === size.key,
        run: () => setFontSize(size.key),
      })),
    },
  ];
  // Only on the desktop: the compact strip answers to the keyboard being up,
  // so there is nothing here to switch. And only with a bar to move: off
  // (Settings › Display) is off everywhere.
  if (!compact && formatBarMode !== "off")
    own.push({
      label: S.formatting,
      items: [
        { label: S.formattingDocked, checked: formatting, run: () => setFormatting(true) },
        { label: S.formattingFloating, checked: !formatting, run: () => setFormatting(false) },
      ],
    });
  return own;
}

/// The page menu of the current screen — the `•••` of the wireframe: the
/// note's own actions, a user list's rename/delete, then the screen's.
/// The Inbox and Completed are recreated on every open, so they are never
/// offered — the core refuses it anyway. `spaceMenus` are the ⋮ of the
/// spaces on screen, lifted in below 768px (shell/spaceMenus.js): each one
/// its own run, a rule between runs.
export function pageMenuOf({
  noteActions,
  screenActions,
  readOnly,
  view,
  inbox,
  completed,
  renameList,
  deleteList,
  spaceMenus = [],
}) {
  const own = [...noteActions];
  if (!readOnly && view.kind === "list" && view.list !== inbox && view.list !== completed) {
    own.push({ label: S.renameList, run: renameList }, { label: S.deleteList, run: deleteList });
  }
  if (spaceMenus.length === 0) return [...own, ...screenActions];
  const runs = [own, ...spaceMenus, screenActions].filter((run) => run.length > 0);
  return runs.flatMap((run, i) => (i === 0 ? run : [{ separator: true }, ...run]));
}
