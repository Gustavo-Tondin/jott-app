// The one arithmetic helper the shell kept spelling by hand as
// `Math.min(Math.max(v, min), max)` — in the sidebar width, the zoom, the
// board's column count, the swipe gestures and the day's timer. A clamp read
// inside-out is easy to write backwards, and nothing says so until the number
// comes out wrong.

/// `value` held between `min` and `max`, inclusive.
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
