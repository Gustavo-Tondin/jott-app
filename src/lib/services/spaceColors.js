// The colour a space READS as, which is not always the colour stored in
// its own `.space.json`.
//
// Colour belongs to the group (user call 2026-08-04): a space inside one
// follows it, and its own colour — the one it had while loose — stops counting
// until it leaves. Without a single answer to this the sidebar said one thing
// (it inherits, through --group-color) and the space title and the tab dot
// said another, so joining a group left the old colour behind in two places.
//
// Since 2026-08-24 the notebook can also ask for the rainbow
// (`autoSpaceColors`): every top-level entry of the sidebar that chose no
// colour is dealt one of the seven hues, in sidebar order, cycling. A colour
// chosen by hand always wins and does not use up a hue — switching the
// rainbow on takes nothing away, and off gives back exactly what was set.

import { ACCENTS } from "./accent.js";
import { sidebarEntries } from "./sidebarOrder.js";

/// The seven, without `neutral` — a rainbow has no grey in it.
const HUES = ACCENTS.filter((name) => name !== "neutral");

/// What each top-level entry reads as, by space path and by group folder.
/// A member of a group reads as the group; the group's own colour, or its
/// dealt one, or `null`.
function resolve(spaces = [], groups = [], { auto = false } = {}) {
  const groupColor = new Map();
  const spaceColor = new Map();

  // The top level, in the order the sidebar draws it: that is the order a
  // rainbow has to follow, or two screens would disagree about which space
  // is the orange one.
  let dealt = 0;
  const next = () => HUES[dealt++ % HUES.length];
  for (const entry of sidebarEntries(spaces, groups)) {
    if (entry.kind === "group") {
      const own = entry.group.color ?? null;
      groupColor.set(entry.group.folder, own ?? (auto ? next() : null));
    } else {
      const own = entry.sp.color ?? null;
      spaceColor.set(entry.sp.path, own ?? (auto ? next() : null));
    }
  }

  // Everything under a top-level group reads as that group: a nested group
  // with a colour of its own keeps it, one without takes its parent's.
  const byFolder = new Map(groups.map((group) => [group.folder, group]));
  const colorOfGroup = (group) => {
    if (groupColor.has(group.folder)) return groupColor.get(group.folder);
    const parent = group.parent ? byFolder.get(group.parent) : null;
    const color = group.color ?? (parent ? colorOfGroup(parent) : null);
    groupColor.set(group.folder, color);
    return color;
  };
  for (const group of groups) {
    const color = colorOfGroup(group);
    for (const name of group.spaces ?? []) spaceColor.set(name, color);
  }
  return { spaceColor, groupColor };
}

/// Maps space path → colour for every space, the group winning over the
/// member. `null` means "no colour of its own" and the CSS falls back to the
/// theme brand.
export function spaceColors(spaces = [], groups = [], options = {}) {
  const { spaceColor } = resolve(spaces, groups, options);
  const colors = {};
  for (const sp of spaces) colors[sp.path] = spaceColor.get(sp.path) ?? null;
  return colors;
}

/// Maps group folder → the colour the group reads as, under the same rules.
export function groupColors(spaces = [], groups = [], options = {}) {
  const { groupColor } = resolve(spaces, groups, options);
  const colors = {};
  for (const group of groups) colors[group.folder] = groupColor.get(group.folder) ?? null;
  return colors;
}
