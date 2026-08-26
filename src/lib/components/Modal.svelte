<script>
  import { onBack } from "../services/back.js";

  // A dialog centred over a dimmed page — the frame the three modals of the
  // app share (the name prompt, the New task composer, the search box).
  //
  // Each of them had written out the same backdrop, and with it the two rules
  // that are easy to lose in a copy:
  //
  //   - the backdrop closes only on ITSELF (`e.target === e.currentTarget`),
  //     or a pointer-up inside the card would dismiss it;
  //   - Escape is SWALLOWED. Without stopPropagation the shell's own Escape
  //     closes the inspector behind the dialog at the same time.
  //
  // All three are mounted OUTSIDE the window (App.svelte), so they sit in no
  // region and would inherit no colour role at all. They declare the CANVAS: a
  // dialog is content — naming a place, composing a task, asking a question —
  // and it opens over the panel, so it is made of the panel's material and not
  // of the frame's (styles/modes/jott.css).
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

  // A dialog is the first thing "back" should close, and this is where every
  // dialog in the app already passes — so registering here covers the six of
  // them at once, and covers the next one for free (services/back.js). It is
  // also what makes the ORDER right without anyone deciding it: a dialog
  // opened over the drawer registers after it, and the stack asks the most
  // recent first.
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
