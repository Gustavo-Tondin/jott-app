// The two Display choices about the note's floating formatting bar
// (2026-08-21): WHEN it shows, and WHICH edge of the canvas it hugs.
//
// A table each, in one place, because three consumers read them and must not
// disagree — the Settings rows that offer them, the shell that acts on them,
// and the search index that has to find them. The same shape `themes.js`
// keeps for the theme and the note size: a key, a label read at render time
// (so a language change reaches it), and the app's own answer beside it.
//
// The keys are what the core stores, unvalidated and by NAME — a mode this
// build has never heard of round-trips through `.jott/config.json` untouched
// (core/src/config.rs). Which is also why nothing here forces an unknown
// value back to the default: `on` below falls back for the sake of the
// interface, not to correct the file.
import { S } from "./strings.js";

/// When the bar floats over an open note.
///
/// `off` is not "no formatting": the same controls stay in the right panel,
/// which is what the panel is for. It takes away the bar over the DOCUMENT,
/// which is the one that costs a strip of the page.
export const FORMAT_BAR_MODES = [
  { key: "always", label: () => S.formatBarAlways },
  { key: "selection", label: () => S.formatBarSelection },
  { key: "off", label: () => S.formatBarOff },
];

export const DEFAULT_FORMAT_BAR = "always";

/// Which edge it hugs — a SIDE, never a corner (user call, 2026-08-21): the
/// bar is always centred on the edge it is given, so there are four answers
/// and not eight. Left and right stand it on end (`FormatBar`'s `rail`),
/// which is the shell's reading of these two keys.
export const FORMAT_BAR_SIDES = [
  { key: "top", label: () => S.formatBarSideTop },
  { key: "left", label: () => S.formatBarSideLeft },
  { key: "right", label: () => S.formatBarSideRight },
  { key: "bottom", label: () => S.formatBarSideBottom },
];

export const DEFAULT_FORMAT_BAR_SIDE = "top";

/// The mode in force, for the interface to act on. Empty means the machine
/// never chose and the notebook had nothing either; an unknown name means a
/// newer build wrote one — both draw the bar the app ships with, because a
/// note with no controls at all would be the worse guess.
export const formatBarMode = (stored) =>
  FORMAT_BAR_MODES.some((mode) => mode.key === stored) ? stored : DEFAULT_FORMAT_BAR;

/// The same, for the side.
export const formatBarSide = (stored) =>
  FORMAT_BAR_SIDES.some((side) => side.key === stored) ? stored : DEFAULT_FORMAT_BAR_SIDE;
