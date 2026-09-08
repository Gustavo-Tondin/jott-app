// The two Display choices about the note's formatting bar: HOW it opens
// with a note, and WHICH edge the floating one hugs. Tables, because three
// consumers must agree (Settings rows, the shell, the search index); same
// shape as `themes.js`. Keys are stored by NAME, unvalidated — an unknown
// mode round-trips untouched; `formatBarMode` falls back for the interface only.
import { S } from "./strings.js";

/// How the bar opens with a note: floating over it, docked in the side
/// panel, or not at all. Only the OPENING — while the note is open the page
/// menu moves it between the first two. On a phone there is no panel to
/// dock in: `panel` reads as `floating` there, and the row does not offer it.
export const FORMAT_BAR_MODES = [
  { key: "floating", label: () => S.formatBarFloating },
  { key: "panel", label: () => S.formatBarPanel, desktopOnly: true },
  { key: "off", label: () => S.formatBarOff },
];

export const DEFAULT_FORMAT_BAR = "panel";

/// Which edge it hugs — a SIDE, never a corner: the bar is centred on its
/// edge, so four answers. Left and right stand it on end (`FormatBar`'s `rail`).
export const FORMAT_BAR_SIDES = [
  { key: "top", label: () => S.formatBarSideTop },
  { key: "left", label: () => S.formatBarSideLeft },
  { key: "right", label: () => S.formatBarSideRight },
  { key: "bottom", label: () => S.formatBarSideBottom },
];

export const DEFAULT_FORMAT_BAR_SIDE = "top";

/// The mode in force. Empty (nobody chose) and an unknown name (a newer
/// build wrote it) both draw the bar the app ships with — a note with no
/// controls would be the worse guess.
export const formatBarMode = (stored) =>
  FORMAT_BAR_MODES.some((mode) => mode.key === stored) ? stored : DEFAULT_FORMAT_BAR;

/// The same, for the side.
export const formatBarSide = (stored) =>
  FORMAT_BAR_SIDES.some((side) => side.key === stored) ? stored : DEFAULT_FORMAT_BAR_SIDE;
