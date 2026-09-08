<script>
  import { onBack } from "../services/back.js";

  // A dialog centred over a dimmed page — the frame every modal shares. Two
  // rules easy to lose in a copy: the backdrop closes only on ITSELF
  // (`e.target === e.currentTarget`), or a pointer-up inside the card would
  // dismiss it; Escape is SWALLOWED, or the shell's own Escape also closes what
  // is behind. Mounted OUTSIDE the window, in no region: it declares the CANVAS.
  let {
    /// What the dialog is called, for the screen reader.
    label = "",
    /// A row of controls needs more room than a single field does.
    wide = false,
    /// The block hooks of the caller, so a grep for `.search__backdrop` still
    /// finds both the markup and the CSS.
    backdropClass = "",
    panelClass = "",
    onClose,
    children,
  } = $props();

  function onKey(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose?.();
  }

  // A dialog is the first thing "back" should close, and every dialog passes
  // here (services/back.js). The ORDER comes free: a dialog opened over the
  // drawer registers after it, and the stack asks the most recent first.
  $effect(() => onBack(() => (onClose?.(), true)));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="theme-modal-backdrop {backdropClass}"
  data-region="canvas"
  role="presentation"
  onpointerdown={(e) => e.target === e.currentTarget && onClose?.()}
  onkeydown={onKey}
>
  <div
    class="theme-modal {panelClass}"
    class:theme-modal--wide={wide}
    role="dialog"
    aria-label={label}
  >
    {@render children()}
  </div>
</div>
