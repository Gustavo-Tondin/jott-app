<script>
  // A TASK'S TITLE, in a small card of its own: what the "Edit" slice of a
  // task card's ring opens (components/ActionRing.svelte). The row's own
  // double-click edits in place, but on a phone there is no double-click and
  // the row would sit under the keyboard — so the card comes up ABOVE the
  // keyboard (task-title-panel.css), and on a desktop floats at the point
  // the ring opened on, the way the note's head panel does.
  import { untrack } from "svelte";
  import { dismissable } from "../actions/dismissable.js";
  import { portal } from "../actions/portal.js";
  import { clamp } from "../services/num.js";
  import { S } from "../services/strings.js";

  let {
    title = "",
    /// `(text) => void` — the new title, trimmed, only when it changed.
    onRename,
    /// `{x, y}` to float at that point on a wide screen; on a phone the
    /// card sits over the keyboard whatever the point.
    at = null,
    /// Closing carries what was typed, like every field of the app.
    onClose,
  } = $props();

  // A DRAFT from here on: a reload of the task behind it must not overwrite
  // what is being typed.
  let draft = $state(untrack(() => title));
  let field = $state(null);
  let panel = $state(null);
  let placed = $state(null);

  let compact = $derived(typeof window !== "undefined" && window.innerWidth < 768);

  $effect(() => {
    queueMicrotask(() => {
      field?.focus();
      field?.select();
    });
  });

  // Floating: kept inside the window by hand, like `NoteHeadPanel`.
  const MARGIN = 8;
  $effect(() => {
    if (compact || !at || !panel) return;
    const r = panel.getBoundingClientRect();
    placed = {
      x: clamp(at.x, MARGIN, Math.max(MARGIN, window.innerWidth - r.width - MARGIN)),
      y: clamp(at.y, MARGIN, Math.max(MARGIN, window.innerHeight - r.height - MARGIN)),
    };
  });

  /// WHAT WAS TYPED IS KEPT, whichever way the panel goes — once, guarded.
  let settled = false;
  function commit() {
    if (settled) return;
    settled = true;
    const next = draft.trim();
    if (next && next !== title) onRename?.(next);
  }
  $effect(() => () => commit());

  function close() {
    commit();
    onClose?.();
  }

  /// Escape is the way out WITHOUT the rename.
  function forget(event) {
    if (event.key !== "Escape") return;
    draft = title;
    close();
  }
</script>

<svelte:window onkeydowncapture={forget} />

<div
  bind:this={panel}
  class="theme-popover task-title-panel"
  class:task-title-panel--loose={!compact && at}
  class:task-title-panel--sheet={compact || !at}
  role="dialog"
  aria-label={S.taskTitlePanel}
  style={!compact && at ? `left: ${(placed ?? at).x}px; top: ${(placed ?? at).y}px` : ""}
  use:portal
  use:dismissable={{ active: true, onDismiss: close }}
>
  <form class="task-title-panel__form" onsubmit={(e) => (e.preventDefault(), close())}>
    <input
      bind:this={field}
      class="theme-input task-title-panel__field"
      aria-label={S.taskTitleField}
      enterkeyhint="done"
      bind:value={draft}
    />
  </form>
</div>
