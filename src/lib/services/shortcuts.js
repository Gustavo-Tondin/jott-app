// What a key press means, in one table.
//
// The app is a capture tool: reaching for the mouse to write down the thing you
// just thought of is the whole cost it exists to remove. So the two creation
// gestures answer from ANY screen, and the shell asks this service what a press
// meant instead of growing a chain of ifs.
//
// It reads an event and answers a name — it decides nothing else. That keeps
// the table testable without a window, and keeps the doing in the shell, which
// is the only place that knows what a notebook is.

/// The action a key press asks for, or null when it asks for nothing.
///
/// `Ctrl` here means the platform's own modifier — `Meta` on macOS — so the
/// shortcut reads native wherever the app runs.
export function shortcutFor(event) {
  // Something nearer the keyboard already answered (the editor, a dialog, the
  // date picker). Acting again would fire the gesture twice.
  if (!event || event.defaultPrevented) return null;

  const combo = event.ctrlKey || event.metaKey;
  // A shortcut this app defines never carries Alt, and never carries both
  // Ctrl and Meta: those belong to the desktop and to combinations we do not
  // want to steal.
  if (event.altKey || (event.ctrlKey && event.metaKey)) return null;

  if (!combo) {
    if (event.key === "F11") return "fullscreen";
    if (event.key === "Escape") return "dismiss";
    return null;
  }

  if (event.shiftKey) return null;

  switch (event.key?.toLowerCase()) {
    case "t":
      return "newTask";
    case "n":
      return "newNote";
    // Both, because both are muscle memory: Ctrl+F is "find in this app" and
    // Ctrl+K is the command box every recent app opens. They lead to the same
    // place, and the app has nothing else to bind them to.
    case "f":
    case "k":
      return "search";
    default:
      return null;
  }
}
