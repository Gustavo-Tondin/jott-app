// The frameless window's state, watched in one place.
//
// The shell draws its own frame (rounded corners + hairline border). When the
// window is maximized or fullscreen that frame must go away: the app then IS
// the screen edge, and a rounded transparent corner would leave dead pixels
// in it. CSS cannot ask the OS about window state, so this service listens
// and reports, and the shell toggles a `window--flush` class.
import { getCurrentWindow } from "@tauri-apps/api/window";

/// Calls `onChange(flush)` right away and again whenever the window enters or
/// leaves the maximized/fullscreen state — `flush` is true when the window
/// fills the screen. Returns a stop function.
export function watchWindowState(onChange) {
  const win = getCurrentWindow();
  let stopped = false;
  let unlisten = null;

  async function probe() {
    try {
      const [maximized, fullscreen] = await Promise.all([
        win.isMaximized(),
        win.isFullscreen(),
      ]);
      if (!stopped) onChange(maximized || fullscreen);
    } catch {
      // No window permissions (tests, plain browsers): keep the frame as is.
    }
  }

  probe();
  // Maximize and fullscreen both resize the window, so one event covers both.
  win
    .onResized(() => probe())
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    })
    .catch(() => {});

  return () => {
    stopped = true;
    unlisten?.();
  };
}

/// F11: a webview has no native fullscreen — without this the key is dead.
export async function toggleFullscreen() {
  const win = getCurrentWindow();
  await win.setFullscreen(!(await win.isFullscreen()));
}
