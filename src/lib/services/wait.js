// The bounds every wake-up timer holds its wait within — the day's turn, the
// reminders, the day summary. A moment already past still waits a beat, so a
// clock that keeps answering "now" cannot spin; and no wait is longer than an
// hour, so a long sleep or a clock jump is caught up within one.

import { clamp } from "./num.js";

/// The shortest wait a timer accepts.
export const MIN_WAIT = 1000;
/// And the longest.
export const MAX_WAIT = 60 * 60 * 1000;

/// `ms` held within the two bounds.
export function boundedWait(ms) {
  return clamp(ms, MIN_WAIT, MAX_WAIT);
}
