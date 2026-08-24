// Which parts of the app are switched on — App Functions (2026-08-06).
//
// Principle 3 says the first use should be the basics, with the rest arriving
// as the user learns; until now the app offered everything, always. Switching
// something off takes it out of the interface ENTIRELY — button, menu, tab,
// card column, sidebar entry — and touches nothing on disk: a task keeps its
// `!2` in the `.md` while priority is off, and gets it back the moment it
// returns.
//
// The question "is this on?" lands in about twenty files, so it is answered
// here and nowhere else. Three rules it carries that a caller would otherwise
// have to remember every time:
//
//   1. **A feature has its own default.** Most ship on; Week, Remind me,
//      Description and Add files ship OFF (user call, 2026-08-06) — a first
//      run should be the basics, and those four are either unfinished or a
//      second thought. The notebook records only what the user changed, so
//      this list is the only place a default is written down. It is also the
//      list the settings screen draws itself from, which is why it cannot also
//      live in the core: two tables in two languages is one table too many.
//   2. **A child follows its parent.** With `tasks` off, every task field is
//      off too, whatever the file says about it.
//   3. **Returning to the default FORGETS the setting** (`stored()` answers
//      `null`), so the file keeps only what differs from how the app ships.

import { S } from "./strings.js";

/// Every switch, in the order the settings screen draws them. `parent` is what
/// a sub-option belongs to; the screen indents by it and `on()` inherits it.
///
/// The screen is built FROM this list, so a new switch is one entry here — not
/// an entry plus a checkbox someone has to remember to add.
export const FEATURES = [
  { key: "tasks", label: () => S.featureTasks },
  { key: "myDay", parent: "tasks", group: "screens", label: () => S.featureMyDay },
  {
    key: "week",
    parent: "tasks",
    group: "screens",
    label: () => S.featureWeek,
    default: false,
  },
  { key: "dueDate", parent: "tasks", group: "fields", label: () => S.featureDueDate },
  { key: "priority", parent: "tasks", group: "fields", label: () => S.featurePriority },
  { key: "repeat", parent: "tasks", group: "fields", label: () => S.featureRepeat },
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
  { key: "banners", parent: "notes", group: "has", label: () => S.featureBanners },
  { key: "wikiLinks", parent: "notes", group: "has", label: () => S.featureWikiLinks },
  { key: "embeds", parent: "notes", group: "has", label: () => S.featureEmbeds },
  {
    key: "noteFolders",
    parent: "notes",
    group: "has",
    label: () => S.featureNoteFolders,
  },
  { key: "pinNotes", parent: "notes", group: "has", label: () => S.featurePinNotes },
  // The three FIXED spaces (user call, 2026-08-24). Not functions — Tasks and
  // Notes above stay on — but the app's own spaces as sidebar entries and
  // screens: hiding one only takes it off the interface, the folders stay on
  // disk untouched. `inline` draws the children indented on the Native
  // Functions page itself, under their master switch, instead of behind a
  // page of their own ("um separador, escrito fixed spaces com toggle, e
  // identado, home, tasks, notes, cada um com seu toggle").
  {
    key: "fixedSpaces",
    inline: true,
    label: () => S.featureFixedSpaces,
    // Said right on the page (user call, 2026-08-24: "deveria ser intuitivo
    // — ao desativar poderia ter um aviso"): what hiding does and does not
    // do, before the first switch is flipped.
    hint: () => S.featureFixedSpacesHint,
  },
  { key: "homeSpace", parent: "fixedSpaces", group: "spaces", label: () => S.featureHomeSpace },
  { key: "tasksSpace", parent: "fixedSpaces", group: "spaces", label: () => S.featureTasksSpace },
  { key: "notesSpace", parent: "fixedSpaces", group: "spaces", label: () => S.featureNotesSpace },
];

/// The app's FUNCTIONS — the switches that, turned off, take a whole part of
/// the interface with them (wireframe "Settings screen mobile", 2026-08-20).
///
/// They are exactly the ones with no parent, which is why this is derived and
/// not a third field somebody has to remember to set: a sub-function belongs
/// to a function by naming it, and everything that names nothing IS one.
export const FUNCTIONS = FEATURES.filter((feature) => !feature.parent);

/// Whether a function has sub-functions of its own — the arrow at the end of
/// its row in Native Functions, and the page that row leads to. Derived for
/// the same reason: a function gains a page by gaining a child.
export function hasPage(key) {
  return FEATURES.some((feature) => feature.parent === key);
}

/// Every sub-function of `parent`, whatever subtitle it was filed under.
///
/// The page draws its rows a group at a time, but the SEARCH asks a different
/// question — "does this word appear anywhere under Tasks?" — and answering it
/// by listing the groups it knows about is how a switch filed under a new one
/// becomes invisible without breaking anything (2026-08-21).
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
