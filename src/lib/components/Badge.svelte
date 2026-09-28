<script>
  // A read-only label on a card: neutral, in a colour handed in, or a
  // `#tag` of an item (`theme-badge--tag`, the brand's). One component — the
  // form is the same `.theme-badge`; only the ink differs.
  import { badgeStyle } from "../services/accent.js";

  let { label, color = null, tag = false, title = undefined, class: extra = "" } = $props();
</script>

<span class="theme-badge {extra}" class:theme-badge--tag={tag} style={badgeStyle(color)} {title}
  >{label}</span
>
