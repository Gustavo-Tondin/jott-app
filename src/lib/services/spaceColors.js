// The colour a space READS as — not always the one in its `.space.json`:
// colour belongs to the group, and a member's own stops counting until it
// leaves. With `autoSpaceColors` (Display) the sidebar wears the RAINBOW
// instead: the seven hues from the accent, one per top-level entry in
// sidebar order, `neutral` closing every lap, ignoring what a space chose.

import { DEFAULT_ACCENT, HUES } from "./accent.js";
import { sidebarEntries } from "./sidebarOrder.js";

/// The cycle: the seven from `accent` going around (the order `accent.js`
/// draws them — the one source), then `neutral`, ALWAYS last. An accent that
/// is not one of the seven starts from the app's own.
export function rainbowFrom(accent) {
  const start = Math.max(0, HUES.indexOf(HUES.includes(accent) ? accent : DEFAULT_ACCENT));
  return [...HUES.map((_, i) => HUES[(start + i) % HUES.length]), "neutral"];
}

/// What each entry reads as, by space path and by group folder.
function resolve(spaces = [], groups = [], { auto = false, accent = null } = {}) {
  const groupColor = new Map();
  const spaceColor = new Map();

  if (auto) {
    const hues = rainbowFrom(accent);
    // Index 0 is the accent, worn by the fixed spaces; the column below
    // them starts at 1, in the order the sidebar draws it — so two screens
    // never disagree about which space is the orange one.
    for (const sp of spaces) if (sp.fixed) spaceColor.set(sp.path, hues[0]);
    let dealt = 1;
    for (const entry of sidebarEntries(spaces.filter((sp) => !sp.fixed), groups)) {
      const hue = hues[dealt++ % hues.length];
      if (entry.kind === "group") groupColor.set(entry.group.folder, hue);
      else spaceColor.set(entry.sp.path, hue);
    }
  } else {
    for (const group of groups) groupColor.set(group.folder, group.color ?? null);
    for (const sp of spaces) spaceColor.set(sp.path, sp.color ?? null);
  }

  // Everything under a top-level group reads as that group. A nested group
  // keeps a colour of its own when the rainbow is off; under the rainbow it
  // is part of its parent's band.
  const byFolder = new Map(groups.map((group) => [group.folder, group]));
  const colorOfGroup = (group) => {
    const parent = group.parent ? byFolder.get(group.parent) : null;
    if (parent && (auto || group.color == null)) {
      const color = colorOfGroup(parent);
      groupColor.set(group.folder, color);
      return color;
    }
    return groupColor.get(group.folder) ?? null;
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
