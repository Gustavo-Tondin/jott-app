// Which parts of the app are switched on — App Functions. Switching one off
// takes it out of the interface ENTIRELY and touches nothing on disk. Three
// rules: a feature has its own default (this list is the only place it is
// written, and the settings screen draws itself from it); a child follows its
// parent; returning to the default FORGETS the setting (`stored()` → `null`).

import { S } from "./strings.js";

/// Every switch, in the order the settings screen draws them. `parent` is what
/// a sub-option belongs to; the screen indents by it and `on()` inherits it.
/// The screen is built FROM this list, so a new switch is one entry here.
export const FEATURES = [
  // No `myDay` and no `week`: the day is the Home, and any day ahead is on the
  // Home's calendar. Hiding the Home space (below) takes the day off the interface.
  { key: "tasks", label: () => S.featureTasks },
  { key: "dueDate", parent: "tasks", group: "fields", label: () => S.featureDueDate },
  { key: "priority", parent: "tasks", group: "fields", label: () => S.featurePriority },
  { key: "repeat", parent: "tasks", group: "fields", label: () => S.featureRepeat },
  {
    key: "remind",
    parent: "tasks",
    group: "fields",
    label: () => S.featureRemind,
    default: false,
  },
  { key: "subtasks", parent: "tasks", group: "fields", label: () => S.featureSubtasks },
  { key: "taskTags", parent: "tasks", group: "fields", label: () => S.featureTaskTags },
  {
    key: "description",
    parent: "tasks",
    group: "fields",
    label: () => S.featureDescription,
    default: false,
  },
  {
    key: "files",
    parent: "tasks",
    group: "fields",
    label: () => S.featureFiles,
    default: false,
  },
  { key: "notes", label: () => S.featureNotes },
  { key: "banners", parent: "notes", group: "has", label: () => S.featureBanners, default: false },
  { key: "wikiLinks", parent: "notes", group: "has", label: () => S.featureWikiLinks },
  { key: "embeds", parent: "notes", group: "has", label: () => S.featureEmbeds },
  {
    key: "noteFolders",
    parent: "notes",
    group: "has",
    label: () => S.featureNoteFolders,
  },
  { key: "pinNotes", parent: "notes", group: "has", label: () => S.featurePinNotes },
  // A note's subjects — the `tags:` property under the title, from the same
  // catalogue as task tags. Off, the line goes and the property stays in the file.
  { key: "noteTags", parent: "notes", group: "has", label: () => S.featureNoteTags, default: false },
  // Off, a table is the pipes it is in the file, and the panel loses its
  // table button; the commands still act on the caret's row and column.
  { key: "tables", parent: "notes", group: "has", label: () => S.featureTables },
  // The three FIXED spaces. Not functions — Tasks and Notes above stay on —
  // but the app's own spaces as sidebar entries and screens: hiding one only
  // takes it off the interface, the folders stay on disk. `inline` draws the
  // children indented on the Native Functions page itself, not behind a page.
  {
    key: "fixedSpaces",
    inline: true,
    label: () => S.featureFixedSpaces,
    // A help button beside the label opens these: what hiding does and does
    // not do, case by case, before the first switch is flipped.
    help: () => [S.fixedSpacesHelpIntro, S.fixedSpacesHelpTasks, S.fixedSpacesHelpNotes],
  },
  { key: "homeSpace", parent: "fixedSpaces", group: "spaces", label: () => S.featureHomeSpace },
  { key: "tasksSpace", parent: "fixedSpaces", group: "spaces", label: () => S.featureTasksSpace },
  { key: "notesSpace", parent: "fixedSpaces", group: "spaces", label: () => S.featureNotesSpace },
  // The time axis: a function with one screen so far, the Timeline. Off, the
  // screen leaves the sidebar; the log under `.jott/timeline/` is written
  // regardless, so switching it back on finds everything in place.
  { key: "time", label: () => S.featureTime },
  { key: "timeline", parent: "time", group: "screens", label: () => S.featureTimeline },
];

/// The app's FUNCTIONS — the switches that, off, take a whole part of the
/// interface with them. Exactly the ones with no parent: derived, not a third
/// field somebody has to remember to set.
export const FUNCTIONS = FEATURES.filter((feature) => !feature.parent);

/// Whether a function has sub-functions of its own — the arrow at the end of
/// its row in Native Functions, and the page that row leads to. Derived for
/// the same reason: a function gains a page by gaining a child.
export function hasPage(key) {
  return FEATURES.some((feature) => feature.parent === key);
}

/// Every sub-function of `parent`, whatever group it was filed under — what
/// the search asks; listing known groups would hide a switch filed under a new one.
export function childrenOf(parent) {
  return FEATURES.filter((f) => f.parent === parent);
}

/// The sub-functions of `parent` that belong to `group` — one subtitle's worth
/// of rows on a function's page. The GROUPING is data, not markup: a switch
/// moves from Fields to Behaviour by changing a word here, and the page draws
/// whatever it is given.
export function childrenIn(parent, group) {
  return childrenOf(parent).filter((f) => f.group === group);
}

const BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f]));

/// How a feature ships. Anything this build has never heard of is on: an older
/// notebook must not be able to switch off something by not mentioning it.
export function defaultOf(key) {
  return BY_KEY[key]?.default ?? true;
}

/// Is `key` switched on — the user's word if they gave one, else its default,
/// and always `false` when its parent is off.
export function on(features, key) {
  const said = features?.[key];
  const self = typeof said === "boolean" ? said : defaultOf(key);
  if (!self) return false;
  const parent = BY_KEY[key]?.parent;
  return parent ? on(features, parent) : true;
}

/// What to STORE for a switch just set to `value`: the value itself, or `null`
/// when it matches the default and the notebook should simply forget it.
export function stored(key, value) {
  return value === defaultOf(key) ? null : value;
}

/// A reader bound to one notebook's flags — what a screen holds, so it can ask
/// `f("repeat")` instead of repeating the map at every call site.
export function reader(features) {
  return (key) => on(features, key);
}
