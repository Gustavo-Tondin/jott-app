<script>
  // A picture, full screen, over everything. Not a `Modal`: a modal is a card
  // with a width to match, and this is one image asking for all the room.
  // Mounted outside the window like every overlay, so it sits in no region:
  // it declares its own ground, dark whatever the theme.
  import { S } from "../services/strings.js";
  import Icon from "./Icon.svelte";

  let { src = "", alt = "", onClose } = $props();

  let frame = $state(null);

  // Focused on mount so Escape lands HERE. Without it the key would reach the
  // shell, which would close the inspector behind a picture nobody meant to
  // dismiss anything with.
  $effect(() => {
    frame?.focus();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="image-viewer"
  bind:this={frame}
  tabindex="-1"
  role="dialog"
  aria-label={alt || S.openFile}
  onkeydown={(e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onClose?.();
  }}
  onpointerdown={(e) => e.target === e.currentTarget && onClose?.()}
>
  <img class="image-viewer__picture" {src} {alt} />
  <button class="image-viewer__close" aria-label={S.closeSheet} title={S.closeSheet} onclick={onClose}>
    <Icon name="x" size="1.25rem" />
  </button>
</div>
