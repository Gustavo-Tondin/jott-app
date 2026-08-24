// What a window is FOR, read off the address it was opened at.
//
// Every window of the app loads the same page. What tells them apart is a
// question in the query string, put there by `commands::shell::open_window`
// when the window was created — the only thing that crosses from the window
// that asked for it.
//
// Nothing else is handed over: the new window opens its own notebook through
// the ordinary `open_notebook`, which files it under that window's own label
// (`src-tauri/src/state.rs`). So a window is not told what it holds; it is
// told what to ask for, and asks.
//
//   ?picker            — the notebooks screen, and no notebook reopened
//   ?notebook=<path>   — open this folder, percent-encoded
//   (nothing)          — the first window: whatever the machine remembers
//
// Split out of App.svelte so the rule can be read (and tested) without a
// window: it is three lines of parsing that decide what the whole app does on
// boot, and it used to be one `if` about the last notebook.

/// What this window was opened to do.
///
/// Returns `{ kind: "picker" }`, `{ kind: "notebook", path }` or
/// `{ kind: "remembered" }` — the last being the first window of the app,
/// which has no question in its address and asks the machine instead.
///
/// `search` is a parameter so the rule can be tested; every caller in the app
/// leaves it out and gets this window's own address.
export function entryOf(search = globalThis.location?.search ?? "") {
  const params = new URLSearchParams(search);
  if (params.has("picker")) return { kind: "picker" };

  // `get` already percent-DEcodes, which is the counterpart of the encoding
  // the Rust side does — a folder may be called anything at all, and a `&` or
  // a `#` in its name would otherwise cut the address in half.
  const path = params.get("notebook");
  // An empty value is not a path. It would reach `open_notebook` as `""` and
  // come back as "is not a Jott notebook", which is an error message about a
  // folder the user never chose.
  if (path) return { kind: "notebook", path };

  return { kind: "remembered" };
}
