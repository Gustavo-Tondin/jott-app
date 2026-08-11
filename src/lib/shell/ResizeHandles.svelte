<script>
  // Resize grips for the frameless window.
  //
  // On GNOME/Wayland an undecorated window gets no OS resize border: the
  // cursor never changes at the edges and nothing tells the user the window
  // can be resized. These eight invisible strips sit on the edges and corners,
  // carry the matching resize cursor (CSS), and hand the drag to the OS via
  // startResizeDragging. The shell renders them only while the window is a
  // free-floating size — when maximized or fullscreen there is nothing to
  // resize into, so App hides them.
  import { getCurrentWindow } from "@tauri-apps/api/window";

  const win = getCurrentWindow();

  // Each grip's hook name → the OS resize direction it drives. The class
  // '--<name>' owns the position and the cursor, in window.css.
  const grips = {
    n: "North",
    s: "South",
    e: "East",
    w: "West",
    ne: "NorthEast",
    nw: "NorthWest",
    se: "SouthEast",
    sw: "SouthWest",
  };
  // Corners after edges, so they stack above the edge strips at the corner.
  const order = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  function grab(name, event) {
    // Left button only; the OS takes over the pointer for the drag.
    if (event.button !== 0) return;
    event.preventDefault();
    win.startResizeDragging(grips[name]).catch(() => {});
  }
</script>

<div class="window__resize" aria-hidden="true">
  {#each order as name (name)}
    <!-- Decorative grips: the layer is aria-hidden, so they carry no role. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="window__resize-grip window__resize-grip--{name}"
      onpointerdown={(e) => grab(name, e)}
    ></div>
  {/each}
</div>
