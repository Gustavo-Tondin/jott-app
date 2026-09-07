// The rows of the footer's notebook menu (2026-09-07) — pure, so the one
// rule with an edge case is testable as data.
//
// A row is a notebook this machine has opened, with the colour it wears and a
// tick on the one that is open. The edge case is the key: `MenuItems` keys a
// row by `context/label`, and two notebooks may share a name (`Work` in two
// places). Only then does a row carry its parent folder as `context` — every
// day it is a plain name, and the day it is not, the qualifier is what tells
// the two apart.

import { DEFAULT_ACCENT, accentColor } from "./accent.js";
import { S } from "./strings.js";

/// The folder a path sits in, as the row's qualifier.
const parentOf = (path) => {
  const parts = String(path ?? "").split(/[\\/]+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : "";
};

/// `recent` is what `api.recentNotebooks()` answers; `current` the open path.
/// `onSwitch(path, newWindow)` and `onManage()` are the two things a row does.
export function notebookRows(recent, current, { onSwitch, onManage }) {
  const names = new Map();
  for (const nb of recent ?? []) names.set(nb.name, (names.get(nb.name) ?? 0) + 1);
  const rows = (recent ?? []).map((nb) => {
    const here = nb.path === current;
    return {
      label: nb.name,
      ...(names.get(nb.name) > 1 ? { context: parentOf(nb.path) } : {}),
      checked: here,
      swatch: accentColor(nb.accentColor || DEFAULT_ACCENT),
      // The open one is a fact, not an action — its row runs nothing.
      run: here ? () => {} : (gesture) => onSwitch?.(nb.path, !!gesture?.newTab),
    };
  });
  rows.push({ label: S.manageNotebooks, run: () => onManage?.() });
  return rows;
}
