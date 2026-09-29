<script>
  // A read-only label: neutral, or the `#tag` of an item
  // (`theme-badge--tag`, the brand's ink). The form is the same `.theme-badge`.
  let { label, tag = false, class: extra = "" } = $props();
</script>

<span class="theme-badge {extra}" class:theme-badge--tag={tag}>{label}</span>
