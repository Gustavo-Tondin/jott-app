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
  { key: "myDay", parent: "tasks", label: () => S.featureMyDay },
  { key: "week", parent: "tasks", label: () => S.featureWeek, default: false },
  { key: "subtasks", parent: "tasks", label: () => S.featureSubtasks },
  { key: "taskTags", parent: "tasks", label: () => S.featureTaskTags },
  { key: "dueDate", parent: "tasks", label: () => S.featureDueDate },
  { key: "remind", parent: "tasks", label: () => S.featureRemind, default: false },
  { key: "repeat", parent: "tasks", label: () => S.featureRepeat },
  { key: "priority", parent: "tasks", label: () => S.featurePriority },
  {
    key: "description",
    parent: "tasks",
    label: () => S.featureDescription,
    default: false,
  },
  { key: "files", parent: "tasks", label: () => S.featureFiles, default: false },
  { key: "notes", label: () => S.featureNotes },
];

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
