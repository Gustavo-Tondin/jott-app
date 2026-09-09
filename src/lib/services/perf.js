// Instrumentation for the cost the user feels — silent unless this machine
// asks: `JOTT_PERF=1` in the environment (the bridge's `perf_enabled`), or
// `?perf=1` in the page's address, the only switch a phone has (set through
// DevTools with `location.search = "?perf=1"`; it lasts one page load). Every
// report is one console line starting with `[perf]`, so `adb logcat` and the
// desktop inspector read the same thing. Thresholds and why: docs/desempenho.md.

/// An editor update over this is half a 60 Hz frame gone to one keystroke.
export const EDITOR_SLOW_MS = 8;
/// Two frames missed between two animation frames: a stall a finger notices.
export const FRAME_GAP_MS = 32;

const FLAG = "perf";

/// The phone's switch, read from the page's own address.
export function flagged(search = globalThis.location?.search ?? "") {
  return new URLSearchParams(search).get(FLAG) === "1";
}

/// One instrument. `now`, `log` and `frame` are injectable for tests; the app
/// uses the singleton below. Every span is measured from a `start()` stamp,
/// which is 0 while off — so a call site keeps its arithmetic in place and
/// pays nothing until asked.
export function makePerf({
  now = () => performance.now(),
  log = (line) => console.info(line),
  frame = (fn) => globalThis.requestAnimationFrame?.(fn),
  flag = flagged,
} = {}) {
  let on = false;
  let watching = false;

  const say = (kind, detail, ms) =>
    log(`[perf] ${kind}${detail ? ` ${detail}` : ""} ${ms.toFixed(1)}ms`);

  const span = (kind, detail, started) => {
    if (!on || !started) return;
    say(kind, detail, now() - started);
  };

  /// The frame-gap watch. rAF drives it, so a hidden window pauses it and
  /// the first frame back reports the whole pause — a gap next to a blur is
  /// read with that in mind.
  function watchFrames() {
    if (watching || !frame) return;
    watching = true;
    let last = now();
    const tick = () => {
      if (!on) {
        watching = false;
        return;
      }
      const at = now();
      if (at - last > FRAME_GAP_MS) say("frame-gap", "", at - last);
      last = at;
      frame(tick);
    };
    frame(tick);
  }

  return {
    get on() {
      return on;
    },
    /// Switches on when the flag says so, else when `ask()` (the bridge)
    /// does. A bridge that fails to answer is "not asked".
    async boot(ask) {
      let asked = flag();
      if (!asked && ask) {
        asked = await Promise.resolve()
          .then(ask)
          .then(Boolean)
          .catch(() => false);
      }
      if (!asked) return false;
      on = true;
      log(`[perf] on — every invoke, editor > ${EDITOR_SLOW_MS}ms, frame gap > ${FRAME_GAP_MS}ms`);
      watchFrames();
      return true;
    },
    /// The stamp a span starts from; 0 while off.
    start: () => (on ? now() : 0),
    /// A bridge call, every one, however short.
    invoke: (command, started) => span("invoke", command, started),
    /// One editor update, when slow; `changed` says whether the document
    /// moved or only the view (selection, effects).
    editor(started, changed) {
      if (!on || !started) return;
      const ms = now() - started;
      if (ms > EDITOR_SLOW_MS) say("editor", changed ? "doc" : "view", ms);
    },
  };
}

export const perf = makePerf();
