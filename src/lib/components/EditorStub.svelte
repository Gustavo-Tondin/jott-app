<script>
  // A textarea standing in for the CodeMirror editor, for tests.
  //
  // The screens above it only ever speak `value`/`onChange`, so swapping the
  // engine out keeps their tests about *them* — the auto-save, the flush on
  // close — instead of about CodeMirror, which jsdom cannot lay out anyway.
  // The live-preview rule has its own tests in `markdown.test.js`.
  let { value = "", readOnly = false, placeholder = "", onChange } = $props();
</script>

<textarea
  {placeholder}
  aria-label={placeholder}
  disabled={readOnly}
  {value}
  oninput={(e) => onChange?.(e.currentTarget.value)}
></textarea>
