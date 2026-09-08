// The Timeline screen's arithmetic — what the log adds up to, month by month,
// with no DOM and no bridge. A thing thrown away loses its name unless the
// notebook says otherwise (`timelineGhostTasks`/`timelineGhostNotes`) and is
// folded into "N deleted tasks" per space. Within a line the order is by
// title only. Repeated task titles fold into one row with a count; NOTES NEVER FOLD.

import { S } from "./strings.js";

/// `yyyy-mm` of an ISO day.
const monthOf = (iso) => iso.slice(0, 7);

/// The `{from, to}` bounds of one calendar year, as the bridge takes them.
export function yearRange(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

/// The three groups of one month, each still a flat list: `created` (tasks
/// born that month), `completed` (tasks ticked that month, whenever born),
/// `notes`. Months newest first; a month with nothing in it does not exist.
export function monthsOf(items = []) {
  const months = new Map();
  const bucket = (key) => {
    if (!months.has(key)) {
      const [year, month] = key.split("-").map(Number);
      months.set(key, { key, year, month, created: [], completed: [], notes: [] });
    }
    return months.get(key);
  };
  for (const item of items) {
    if (!item?.created) continue;
    if (item.kind === "note") bucket(monthOf(item.created)).notes.push(item);
    else {
      bucket(monthOf(item.created)).created.push(item);
      if (item.completed) bucket(monthOf(item.completed)).completed.push(item);
    }
  }
  return [...months.values()]
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .map((m) => ({
      ...m,
      created: m.created.sort(byTitle),
      completed: m.completed.sort(byTitle),
      notes: m.notes.sort(byTitle),
    }));
}

/// The three groups of ONE day — the Home's recap of a day gone by.
/// `monthsOf` cannot answer this: `Notebook::timeline(day, day)` hands back
/// everything born OR ticked that day, and a task born earlier and ticked
/// today belongs to `completed` alone.
export function dayGroups(items = [], day) {
  const created = [];
  const completed = [];
  const notes = [];
  for (const item of items) {
    if (!item?.created) continue;
    if (item.kind === "note") {
      if (item.created === day) notes.push(item);
      continue;
    }
    if (item.created === day) created.push(item);
    if (item.completed === day) completed.push(item);
  }
  return {
    created: created.sort(byTitle),
    completed: completed.sort(byTitle),
    notes: notes.sort(byTitle),
  };
}

/// When one row stands for several: the newest occurrence, so a click opens
/// something that is still there. `completed` when the line is about the day
/// a task was ticked, `created` otherwise.
const latestOf = (item) => item.completed || item.created || "";

/// One line's rows, as drawn: the living (and the named ghosts) one row each,
/// by title, repeated task titles folded into one row carrying a `count`
/// (the row IS the newest occurrence, so a click opens something real); the
/// nameless ghosts folded into `{ghost: true, kind, space, count}` after
/// them. `ghostTasks`/`ghostNotes` on: a ghost keeps its row and birth title, never folded.
export function rowsOf(items = [], { ghostTasks = false, ghostNotes = false } = {}) {
  const rows = [];
  const folded = new Map();
  const repeated = new Map();
  const named = (item) => (item.kind === "task" ? ghostTasks : ghostNotes);
  for (const item of items) {
    if (!item.deleted || named(item)) {
      // Only a live task folds — by TITLE, not by the repeat chain (`spawned:`
      // lives in the files; the log carries no pointer). A note is a file:
      // two files with one title are two documents, never one row.
      if (item.deleted || item.kind !== "task") {
        rows.push(item);
        continue;
      }
      const key = `${item.space ?? ""}\u0000${item.title ?? ""}`;
      const standing = repeated.get(key);
      if (!standing) {
        const row = { ...item, count: 1 };
        repeated.set(key, row);
        rows.push(row);
        continue;
      }
      standing.count += 1;
      // The row becomes the newest of the chain, keeping the count it has
      // already gathered.
      if (latestOf(item) > latestOf(standing)) {
        Object.assign(standing, item, { count: standing.count });
      }
      continue;
    }
    const key = `${item.kind}:${item.space ?? ""}`;
    if (!folded.has(key)) {
      folded.set(key, { ghost: true, kind: item.kind, space: item.space ?? null, count: 0 });
    }
    folded.get(key).count += 1;
  }
  // The biggest group first: "12 deleted tasks · 1 deleted task" reads as
  // a count, the other way round as a list.
  return [...rows, ...[...folded.values()].sort((a, b) => b.count - a.count)];
}

/// The header's three numbers for the month `today` is in: notes created,
/// tasks created, tasks completed.
export function monthStats(items = [], today) {
  const month = monthOf(today);
  let notes = 0;
  let created = 0;
  let completed = 0;
  for (const item of items) {
    if (!item?.created) continue;
    if (item.kind === "note") {
      if (monthOf(item.created) === month) notes += 1;
    } else {
      if (monthOf(item.created) === month) created += 1;
      if (item.completed && monthOf(item.completed) === month) completed += 1;
    }
  }
  return { notes, created, completed };
}

/// What a folded ghost row says.
export function ghostLabel(row) {
  return row.kind === "note" ? S.deletedNotes(row.count) : S.deletedTasks(row.count);
}

/// The month's name, as the wireframe writes it: "August".
export function monthName(month) {
  return S.months[month - 1] ?? "";
}
