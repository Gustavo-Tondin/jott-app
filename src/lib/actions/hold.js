// A finger RESTING on a control runs `onHold`, and the click its lift would
// send is swallowed — the wait and slop a card's ring uses (reorder.js).
// Touch only: a mouse has its right button. Without `onHold` it is inert.
//
//   <button onclick={tap} use:hold={{ onHold }}>
const HOLD_MS = 400;
const HOLD_SLOP = 8;

export function hold(node, params) {
  let opts = params ?? {};
  let press = null;
  let held = false;

  const off = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };

  function down(event) {
    off();
    held = false;
    if (event.pointerType !== "touch" || !opts.onHold) return;
    press = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        press = null;
        held = true;
        opts.onHold?.();
      }, HOLD_MS),
    };
  }

  function move(event) {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > HOLD_SLOP) off();
  }

  function click(event) {
    if (!held) return;
    held = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  // The WebView's own long press (selection, callout) is the same gesture.
  function menu(event) {
    if (opts.onHold && (press || held)) event.preventDefault();
  }

  const on = [
    ["pointerdown", down],
    ["pointermove", move],
    ["pointerup", off],
    ["pointercancel", off],
    // Capture: at the target it runs before the control's own listener.
    ["click", click, true],
    ["contextmenu", menu],
  ];
  for (const [type, fn, capture] of on) node.addEventListener(type, fn, capture);

  return {
    update(next) {
      opts = next ?? {};
    },
    destroy() {
      off();
      for (const [type, fn, capture] of on) node.removeEventListener(type, fn, capture);
    },
  };
}
