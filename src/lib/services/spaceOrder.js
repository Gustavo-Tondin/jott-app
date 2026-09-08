// How a space arranges its items — the one implementation both the tasks
// screen and the notepad read. The preference lives in the space's own
// `.space.json` (`sort` + `order`); content files never carry it. Pure: items
// and accessors in, a new array out. An unknown `sort` reads as the file order.

/// The list with the item at `from` re-seated at `to` — the one splice every
/// drag in the app performs.
export function movedItem(list, from, to) {
  const next = [...list];
  const [carried] = next.splice(from, 1);
  next.splice(to, 0, carried);
  return next;
}

/// Arranges `items` by `sort`: `name` (case-insensitive), `created` (oldest
/// first), `completed` (most recent first; items without the date keep
/// their order at the end), `custom` (the dragged `order` of `keyOf` keys
/// first, the rest after in file order), anything else the file order.
/// Every sort is stable and missing values go last.
export function arrange(items, sort, order, { nameOf, createdOf, completedOf, keyOf }) {
  switch (sort) {
    case "name":
      return sortedBy(items, (item) => (nameOf(item) ?? "").toLowerCase());
    case "created":
      return sortedBy(items, (item) => createdOf(item) ?? "￿");
    case "completed":
      // Descending, so "" (missing) lands at the end here too.
      return sortedBy(items, (item) => completedOf(item) ?? "", true);
    case "custom": {
      if (!order?.length) return [...items];
      const rank = new Map(order.map((key, i) => [key, i]));
      return sortedBy(items, (item) => rank.get(keyOf(item)) ?? Infinity);
    }
    default:
      return [...items];
  }
}

/// Floats the pinned items to the top, keeping the arrangement inside each
/// half. Applied AFTER `arrange`: pinning outranks the sort.
export function pinnedFirst(items, isPinned = (item) => !!item.pinned) {
  const pinned = items.filter(isPinned);
  if (pinned.length === 0 || pinned.length === items.length) return [...items];
  return [...pinned, ...items.filter((item) => !isPinned(item))];
}

/// Whether an item dropped at display index `to` landed in the pinned block —
/// how dragging across the divider pins and unpins. `pinnedElsewhere` counts
/// the pinned items OTHER than the one moved: a pinned item keeps a slot of
/// its own and may drop at the block's end; an unpinned one must land inside.
export function landsPinned(to, pinnedElsewhere, wasPinned) {
  return to < pinnedElsewhere + (wasPinned ? 1 : 0);
}

/// Several items moved as one block (a selection dragged together): they
/// leave their slots, keeping file order, and land where the CARRIED one —
/// `froms[0]`, the item under the pointer — would have landed alone. `to` is
/// in `movedItem`'s terms (a slot with `froms[0]` taken out); every other
/// moved item that sat before that slot moves it up by one.
export function movedItems(list, froms, to) {
  const [from, ...others] = froms;
  const moving = new Set(froms);
  const block = list.filter((_, i) => moving.has(i));
  const rest = list.filter((_, i) => !moving.has(i));
  const before = others.filter((i) => (i < from ? i : i - 1) < to).length;
  const at = Math.max(0, Math.min(rest.length, to - before));
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/// `planReorder` for a block: the arrangement, the items moved, and the pin
/// the whole block lands with — crossing the divider pins or unpins all of
/// them together, the way one item would. `pinChanged` lists those whose pin
/// actually changes.
export function planReorderMany(items, froms, to, isPinned = (item) => !!item.pinned) {
  const moved = [...froms].sort((a, b) => a - b).map((i) => items[i]);
  const next = movedItems(items, froms, to);
  const movedSet = new Set(moved);
  const pinnedElsewhere = next.filter((item) => !movedSet.has(item) && isPinned(item)).length;
  const pinned = landsPinned(next.indexOf(moved[0]), pinnedElsewhere, moved.some(isPinned));
  return { next, moved, pinned, pinChanged: moved.filter((item) => isPinned(item) !== pinned) };
}

/// What a drop means: the arrangement the user just built, and the pin the
/// dragged item ends up with. `items` is what is ON SCREEN (pinned block
/// first) and `from`/`to` are screen indices; the caller translates back to
/// file positions through `moved` and `next`. Pure, testable without a DOM.
export function planReorder(items, from, to, isPinned = (item) => !!item.pinned) {
  const moved = items[from];
  const next = movedItem(items, from, to);
  const pinned = landsPinned(
    to,
    next.filter((item) => item !== moved && isPinned(item)).length,
    isPinned(moved),
  );
  return { next, moved, pinned, pinChanged: pinned !== isPinned(moved) };
}

function sortedBy(items, keyOf, desc = false) {
  // Array.prototype.sort is stable, which is what keeps equal keys (and every
  // missing-value item) in their file order.
  return [...items].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (ka === kb) return 0;
    return (ka < kb ? -1 : 1) * (desc ? -1 : 1);
  });
}
