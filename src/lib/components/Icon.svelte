<script>
  // Draws a vendored Phosphor SVG by name. The single door to icons in the UI —
  // the rest of the app says `<Icon name="..." />` and never touches raw SVG.
  import { ICONS } from "./icons.js";

  let { name, size = "1em", label = null } = $props();

  let svg = $derived(ICONS[name] ?? "");
</script>

<span
  class="theme-icon"
  style="--icon-size:{size}"
  role={label ? "img" : "presentation"}
  aria-label={label}
  aria-hidden={label ? null : "true"}
>
  {@html svg}
</span>
