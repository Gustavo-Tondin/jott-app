<script>
  // The workspace colour + icon popup, opened from the ⋮ menu (controlled by
  // `open`). A preset palette and a curated set of icons (all vendored).
  // Picking calls onColor/onIcon with the value — an empty string clears it,
  // back to the default. Stays open across picks so both can be set at once;
  // closes on outside pointer or Escape (swallowed) via onClose.
  import Icon from "./Icon.svelte";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import { S } from "../services/strings.js";

  let {
    open = false,
    color = null,
    icon = null,
    onColor,
    onIcon,
    onClose,
    /// A workspace inside a group picks its ICON but not its colour — the
    /// colour is the group's, for the whole section (2026-08-04/08-06).
    colors = true,
  } = $props();

  const COLORS = [
    "#2f6fed", "#16a34a", "#eaa317", "#e5484d", "#8b5cf6", "#0d9488", "#db2777",
  ];
  // The two type defaults lead the row (services/workspaceIcon.js), so the
  // icon a list or a notepad already wears is also the one to pick again.
  const ICONS = [
    "list-checks", "notepad", "folder", "house", "check-square", "note",
    "list-bullets", "flag", "sun", "sparkle",
  ];

</script>

<div class="palette" use:dismissable={{ active: open, onDismiss: () => onClose?.() }}>
  {#if open}
    <div class="theme-popover theme-popover--end palette__panel" use:keepOnScreen>
      {#if colors}
      <div class="palette__row" role="group" aria-label={S.color}>
        <button
          class="palette__swatch palette__swatch--clear"
          class:palette__swatch--on={!color}
          aria-label={S.defaultAppearance}
          onclick={() => onColor?.("")}
        ></button>
        {#each COLORS as c (c)}
          <button
            class="palette__swatch"
            class:palette__swatch--on={color === c}
            style={`--dot: ${c}`}
            aria-label={c}
            onclick={() => onColor?.(c)}
          ></button>
        {/each}
      </div>
      {/if}
      <div class="palette__row" role="group" aria-label={S.icon}>
        {#each ICONS as name (name)}
          <button
            class="palette__icon"
            class:palette__icon--on={icon === name}
            aria-label={name}
            onclick={() => onIcon?.(name)}
          >
            <Icon {name} size="1rem" />
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>
