// A space's own ⋮, lifted into the page ⋮. Below 768px the top bar already
// holds the screen's menu, and a second ⋮ alone on the canvas is a widget's
// leftover: there the space hands its items to the shell instead of drawing
// a button. Each space holds one SLOT, ordered by `rank` and then by mount,
// so the Home's two blocks keep the order they are drawn in.
import { getContext, onDestroy, setContext } from "svelte";

const KEY = Symbol("space-menus");

/// The shell's half: `lifted()` says whether spaces hand over their menus
/// (the compact shell), `onChange(groups)` receives every slot's items, in
/// slot order, empty slots left out.
export function provideSpaceMenus({ lifted, onChange }) {
  let slots = [];
  const publish = () => onChange(slots.map((slot) => slot.items).filter((items) => items.length));
  setContext(KEY, {
    lifted,
    slot(rank) {
      const slot = { items: [], rank };
      // Stable: equal ranks keep mount order.
      slots = [...slots, slot].sort((a, b) => a.rank - b.rank);
      return {
        set(items) {
          slot.items = items ?? [];
          publish();
        },
        release() {
          slots = slots.filter((other) => other !== slot);
          publish();
        },
      };
    },
  });
}

/// The space's half. Returns `lifted()` — whether to draw no ⋮ of its own —
/// and `offer(items)`, to be called from an `$effect` with the current menu.
/// Outside a shell (a test mounting the space alone) nothing is lifted.
/// A higher `rank` sits lower in the page menu.
export function liftSpaceMenu({ rank = 0 } = {}) {
  const host = getContext(KEY);
  if (!host) return { lifted: () => false, offer: () => {} };
  const slot = host.slot(rank);
  onDestroy(() => slot.release());
  return {
    lifted: host.lifted,
    offer: (items) => slot.set(host.lifted() ? items : []),
  };
}
