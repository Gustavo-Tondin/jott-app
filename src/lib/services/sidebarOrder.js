// The sidebar's column: groups — which nest — and the lists and notepads
// they hold, in one running order.
//
// Groups and loose entries used to be two `{#each}` blocks in two containers,
// which is why a group could not be dragged at all and a space could not
// be dragged past one (2026-08-06). Merging them raised one question — where
// does a GROUP sit? — and the answer here is: **where its members sit**.
//
// That is what keeps the notebook honest. The config already holds one ordered
// list of space names (`order.spaces`); a group's members are simply
// contiguous in it, so the group needs no ordering of its own and there is no
// second list to fall out of step. An empty group has no member to borrow a
// place from and waits at the end — and, having no name in the order, it also
// cannot be dragged anywhere until something is in it.
//
// Since 2026-08-11 a group may hold other groups, so this is a TREE: every
// group entry carries its `children`, and each level of the sidebar reorders
// within itself. The flat name list still describes the whole thing, because a
// subtree's names are contiguous in it.
//
// Pure on purpose: what a drag MEANS is a decision, and decisions are testable
// without a DOM (same reason `spaceOrder.planReorder` exists).

/// Rank compare that survives two `Infinity`s (which subtract to NaN, and a
/// NaN comparator silently keeps whatever order it was handed).
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

/// The flat list of names after dragging `from` to `to` **within one level** —
/// what the config's `order.spaces` becomes.
///
/// `parentKey` is the key of the group whose children were dragged, or `null`
/// for the top level. Every other level is copied out untouched, so a drag
/// deep in the tree rewrites only its own run of names.
export function reorderedAt(tree, parentKey, from, to) {
  const moved = (list) => {
    const next = [...list];
    const [carried] = next.splice(from, 1);
    next.splice(to, 0, carried);
    return next;
  };
  const walk = (entries, key) =>
    (key === parentKey ? moved(entries) : entries).flatMap((entry) =>
      entry.kind === "group" ? walk(entry.children, entry.key) : [entry.sp.path],
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
    // Groups nest now (2026-08-11), so a group dropped on a group joins it.
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
