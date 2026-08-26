<script>
  // A read-only label on a card: the ORIGIN of an item (its space's name in
  // the space's colour) or a `#tag` (neutral). One component for both — the
  // form is the same `.theme-badge`; only whether a colour is worn differs.
  import { badgeStyle } from "../services/accent.js";

  let { label, color = null, title = undefined, class: extra = "" } = $props();
</script>

<span class="theme-badge {extra}" style={badgeStyle(color)} {title}>{label}</span>
