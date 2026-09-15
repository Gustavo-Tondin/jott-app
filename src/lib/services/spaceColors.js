// The colour a space READS as — not always the one in its `.space.json`:
// colour belongs to the group, and a member's own stops counting until it
// leaves. Under the RAINBOW — what a notebook does until it is left
// (`rainbowSpaces`) — the sidebar wears the seven hues from the accent, one
// per top-level entry in sidebar order, `neutral` closing every lap,
// ignoring what a space chose. Leaving it writes the deal down, so what the
// column was showing is what it keeps (`Notebook::set_rainbow_spaces`).

import { DEFAULT_ACCENT, HUES, slotOf } from "./accent.js";
import { sidebarEntries } from "./sidebarOrder.js";

/// The cycle: the seven from `accent` going around (the order `accent.js`
/// draws them — the one source), then `neutral`, ALWAYS last. An accent that
/// is not one of the seven starts from the app's own.
export function rainbowFrom(accent) {
  const start = Math.max(0, HUES.indexOf(HUES.includes(accent) ? accent : DEFAULT_ACCENT));
  return [...HUES.map((_, i) => HUES[(start + i) % HUES.length]), "neutral"];
}

/// What each entry reads as, by space path and by group folder.
function resolve(spaces = [], groups = [], { rainbow = false, accent = null } = {}) {
  const groupColor = new Map();
  const spaceColor = new Map();

  if (rainbow) {
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
    if (parent && (rainbow || group.color == null)) {
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

/// The colour a NEW top-level entry is born wearing once the column has LEFT
/// the rainbow: the one after the last entry's, so what is made next goes on
/// around the wheel even though nothing is being dealt any more. An entry
/// wearing nothing — or a colour of its own that is not one of the eight —
/// leaves the position to answer, which is what the deal would have said.
export function nextRainbowColor(spaces = [], groups = [], accent = null) {
  const hues = rainbowFrom(accent);
  // The top level is all the rainbow deals to; the fixed three are not in it.
  const entries = sidebarEntries(spaces.filter((sp) => !sp.fixed), groups);
  const last = entries[entries.length - 1];
  const worn = last ? slotOf(last.kind === "group" ? last.group.color : last.sp.color) : null;
  const at = worn ? hues.indexOf(worn) : -1;
  return at >= 0 ? hues[(at + 1) % hues.length] : hues[(entries.length + 1) % hues.length];
}

/// The deal as it goes to disk when the column leaves the rainbow: every
/// entry that OWNS a colour, mapped to the one it is showing. A space inside
/// a group is left out (the colour is the group's, and writing it would leave
/// a stale one behind when it moves out), and so are the fixed three — their
/// dealt colour is the accent, which is what wearing none already means.
export function dealtColors(spaces = [], groups = [], options = {}) {
  const { spaceColor, groupColor } = resolve(spaces, groups, options);
  const grouped = new Set(groups.flatMap((group) => group.spaces ?? []));
  const colors = {};
  for (const sp of spaces) {
    if (sp.fixed || grouped.has(sp.path)) continue;
    colors[sp.path] = spaceColor.get(sp.path) ?? null;
  }
  const folders = {};
  for (const group of groups) folders[group.folder] = groupColor.get(group.folder) ?? null;
  return { spaces: colors, groups: folders };
}
