// The Timeline screen's arithmetic — what the log adds up to, month by month.
//
// The core answers `Notebook::timeline(from, to)` with flat items
// (`{kind, id, path, created, title, deleted, completed, space}`); the
// screen draws MONTHS (wireframe "Timeline Screen", 2026-08-27), each with
// three lines — tasks created, tasks completed, notes created — that fold
// open onto the items. Everything between the two shapes is here, with no
// DOM and no bridge, so the screen only has to draw.
//
// Two rules the wireframe fixed:
//
//   • a thing thrown away loses its name unless the notebook says otherwise
//     (`timelineGhostTitles`) — it may have been thrown away FOR privacy —
//     and what is left is folded into "N deleted tasks" per space, so the
//     colour still says where the activity was;
//   • within a line the order is by title, nothing else: the log knows the
//     minute, and showing it was refused ("só por título", 2026-08-27).
//
// And one the repeat chain forced (2026-08-31). Every occurrence of a
// repeating task is its OWN task, with its own id — `recurrence::respawn`
// clones the text and `complete_task` links the two with `spawned:`, so a
// daily chore writes thirty `created` lines and thirty `completed` ones into
// a single month. The screen was a wall of the same sentence. They fold into
// one row carrying a count, and the row IS the newest occurrence, so the
// click still opens something real.
//
// It folds by TITLE and not by the chain, which the front cannot see: the
// chain lives in `spawned:` inside the files, and the log carries no such
// pointer. The cost is two tasks a person happened to name the same in one
// month reading as one with a ×2 — accepted (user call, 2026-08-31), because
// the alternative is a flag the core would have to stamp on every item to
// answer a question the screen only asks about volume. NOTES ARE NEVER
// FOLDED: a note is a file, two files with one title are two documents, and
// a count with nothing to open would put one of them out of reach.

import { S } from "./strings.js";

/// `yyyy-mm` of an ISO day.
const monthOf = (iso) => iso.slice(0, 7);

/// The `{from, to}` bounds of one calendar year, as the bridge takes them.
export function yearRange(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

/// The three groups of one month, each still a flat list of items:
/// `created` (tasks born that month), `completed` (tasks ticked that month,
/// whenever born) and `notes` (notes born that month). Months come newest
/// first, and a month with nothing in it does not exist — the column shows
/// activity, not the calendar.
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

/// The three groups of ONE day — the Home's recap of a day gone by
/// (2026-09-04). `monthsOf` cannot answer this: `Notebook::timeline(day,
/// day)` hands back everything born OR ticked that day, and a task born
/// earlier in the month and ticked today belongs to `completed` alone.
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

/// One line's rows, as drawn: the living (and the named ghosts) one row
/// each, by title, with repeated task titles folded into one row carrying a
/// `count`; the nameless ghosts folded into one row per space —
/// `{ghost: true, kind, space, count}` — after them, so a line reads
/// "Buy milk · Take out the bins ×12 · 3 deleted tasks".
///
/// A row is a plain item when it stands for itself and an item plus `count`
/// when it stands for more, so the screen has one shape to draw and one
/// number to look at.
///
/// `ghostTitles` is the notebook's `timelineGhostTitles`: on, a ghost keeps
/// its row and its birth title, struck through — and keeps a row of its own,
/// never folded into a live count.
export function rowsOf(items = [], { ghostTitles = false } = {}) {
  const rows = [];
  const folded = new Map();
  const repeated = new Map();
  for (const item of items) {
    if (!item.deleted || ghostTitles) {
      // Only a live task folds: see the file's head for the note.
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
