// The sidebar's column — groups (which nest) and the lists and notepads
// they hold — as a tree in one running order. A group has no order of its
// own: it sits WHERE ITS MEMBERS SIT in the config's flat `order.spaces`,
// where a subtree's names are contiguous. An empty group waits at the end
// and cannot be dragged. Pure on purpose, like `spaceOrder.planReorder`.

import { movedItem } from "./spaceOrder.js";

/// Rank compare that survives two `Infinity`s: they subtract to NaN, and a
/// NaN comparator silently keeps whatever order it was handed.
const byRank = (a, b) => (a.rank === b.rank ? 0 : a.rank < b.rank ? -1 : 1);

/// The column, as a tree. `spaces` comes from the core already ordered;
/// each group carries the group it sits in (`parent`) and the leaf names it
/// holds directly.
export function sidebarEntries(spaces = [], groups = []) {
  const rankOf = new Map(spaces.map((sp, i) => [sp.path, i]));
  const byName = new Map(spaces.map((sp) => [sp.path, sp]));
  const grouped = new Set(groups.flatMap((group) => group.spaces));

  const wsEntry = (sp) => ({
    kind: "space",
    key: `sp:${sp.path}`,
    sp,
    rank: rankOf.get(sp.path) ?? Infinity,
  });

  const groupEntry = (group) => {
    const children = [
      ...groups.filter((g) => (g.parent ?? null) === group.folder).map(groupEntry),
      ...group.spaces.map((name) => byName.get(name)).filter(Boolean).map(wsEntry),
    ].sort(byRank);
    return {
      kind: "group",
      key: `group:${group.folder}`,
      group,
      children,
      // Where its members sit — reaching through nested groups, since their
      // members are this one's members too as far as the order is concerned.
      rank: children.length > 0 ? Math.min(...children.map((c) => c.rank)) : Infinity,
    };
  };

  return [
    ...groups.filter((group) => (group.parent ?? null) === null).map(groupEntry),
    ...spaces.filter((sp) => !grouped.has(sp.path)).map(wsEntry),
  ].sort(byRank);
}

/// The names an entry contributes to the running order, in order — a group
/// speaks for everything under it, however deep.
export function namesOf(entry) {
  return entry.kind === "group" ? entry.children.flatMap(namesOf) : [entry.sp.path];
}

/// The flat list of names after dragging `from` to `to` within ONE level —
/// what `order.spaces` becomes. `parentKey` is the key of the group whose
/// children were dragged (`null` = top level); every other level is copied
/// out untouched.
export function reorderedAt(tree, parentKey, from, to) {
  const moved = (list) => movedItem(list, from, to);
  // Below the moved level nothing changes, so the rest is `namesOf`.
  const walk = (entries, key) =>
    key === parentKey
      ? moved(entries).flatMap(namesOf)
      : entries.flatMap((entry) =>
          entry.kind === "group" ? walk(entry.children, entry.key) : namesOf(entry),
        );
  return walk(tree, null);
}

/// What dropping entry `from` ON entry `into` means, among the siblings of one
/// level. `null` when it means nothing.
export function dropMeaning(entries, from, into) {
  const moving = entries[from];
  const target = entries[into];
  if (!moving || !target || moving === target) return null;

  if (target.kind === "group") {
    // A group dropped on a group joins it.
    return moving.kind === "group"
      ? { kind: "groupIntoGroup", group: target.group, moving: moving.group }
      : { kind: "intoGroup", group: target.group, space: moving.sp };
  }
  // A group dropped on a loose entry means nothing: there is no container to
  // join, and quietly flattening the group would lose it.
  if (moving.kind === "group") return null;
  // Two loose entries: they become a group of their own, named by the user.
  return { kind: "groupWith", host: target.sp, space: moving.sp };
}
