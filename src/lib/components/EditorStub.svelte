<script>
  // A textarea standing in for the CodeMirror editor, for tests.
  //
  // The screens above it only ever speak `value`/`onChange`, so swapping the
  // engine out keeps their tests about *them* — the auto-save, the flush on
  // close — instead of about CodeMirror, which jsdom cannot lay out anyway.
  // The live-preview rule has its own tests in `markdown.test.js`.
  let {
    value = "",
    readOnly = false,
    placeholder = "",
    onChange,
    /// The one other thing the shell listens to (2026-08-21): whether
    /// something is selected. A textarea knows the same fact by its own two
    /// offsets, which is enough for a screen test to ask "does the bar show?"
    /// — whether CODEMIRROR reports it right is the real engine's test
    /// (editorSelection.test.js).
    onSelection,
  } = $props();

  let field = $state(null);

  /// The real editor writes at the cursor; here the end of the text is close
  /// enough, and what the tests are about is that something was written at
  /// all — with the address the library answered with.
  export function insert(text) {
    if (!text) return;
    onChange?.(`${field?.value ?? value}${text}`);
  }

</script>

<textarea
  bind:this={field}
  {placeholder}
  aria-label={placeholder}
  disabled={readOnly}
  {value}
  oninput={(e) => onChange?.(e.currentTarget.value)}
  onselect={(e) =>
    onSelection?.(e.currentTarget.selectionStart !== e.currentTarget.selectionEnd)}
></textarea>
