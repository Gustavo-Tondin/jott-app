// How a space arranges its items — the one implementation both the tasks
// screen and the notepad read (princípio 7).
//
// The preference lives in the space's own `.space.json` (`sort` + `order`,
// Etapa 1 2026-08-04); the content files never carry it. This module is pure:
// a screen hands in its items and accessors, and gets a new array back. An
// unknown `sort` reads as the file order — the same tolerance the config
// itself keeps, so a file written by a future build degrades politely.

/// The list with the item at `from` re-seated at `to` — the one splice every
/// drag in the app performs. It was written out five times (the tabs, the
/// sidebar, the subtasks, the shell, and here) before it had a name.
export function movedItem(list, from, to) {
  const next = [...list];
  const [carried] = next.splice(from, 1);
  next.splice(to, 0, carried);
  return next;
}

/// Arranges `items` by `sort`:
/// - `name`: alphabetical, case-insensitive;
/// - `created`: oldest first (the file-append order, made explicit);
/// - `completed`: most recently completed first — items without the date
///   (open tasks, notes) keep their relative order at the end;
/// - `custom`: the dragged `order` (of `keyOf` keys) first, the rest after,
///   in file order;
/// - anything else: the file order, untouched.
///
/// Every sort is stable and missing values go last, so a hand-written item
/// without a stamp never jumps ahead of the ones the app recorded.
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
/// half (2026-08-05). Applied AFTER `arrange`, because pinning outranks the
/// sort: a pinned task stays at the top whatever ordering is on.
export function pinnedFirst(items, isPinned = (item) => !!item.pinned) {
  const pinned = items.filter(isPinned);
  if (pinned.length === 0 || pinned.length === items.length) return [...items];
  return [...pinned, ...items.filter((item) => !isPinned(item))];
}

/// Whether an item dropped at display index `to` landed in the pinned block —
/// which is how dragging across the divider pins and unpins (2026-08-05).
///
/// `pinnedElsewhere` counts the pinned items OTHER than the one being moved.
/// A pinned item keeps a slot of its own in the block, so it may be dropped at
/// the block's end and stay pinned; an unpinned one has to land above the
/// divider, strictly inside the block, to join it.
export function landsPinned(to, pinnedElsewhere, wasPinned) {
  return to < pinnedElsewhere + (wasPinned ? 1 : 0);
}

/// What a drop means: the arrangement the user just built, and the pin the
/// dragged item ends up with.
///
/// `items` is what is ON SCREEN (pinned block first), and `from`/`to` are the
/// screen indices the reorder action reports — so this is also where a caller
/// translates back to file positions, through `moved` and `next`. Pure, so the
/// rule that crossing the divider pins and unpins is testable without a DOM.
/// Several items moved as one block (a selection dragged together): they leave
/// their slots, keeping their file order, and land in a row where the CARRIED
/// one — `froms[0]`, the item under the pointer — would have landed alone.
/// `to` is what the action reports for that one item, in `movedItem`'s
/// terms: a slot in the list with `froms[0]` taken out. The rest of the pile
/// was also taken out, so every one of them that sat before that slot moves
/// it up by one.
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
