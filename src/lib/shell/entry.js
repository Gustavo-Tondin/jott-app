// What a window is FOR, read off the query string `commands::shell::open_window`
// put in its address — the only thing that crosses from the window that asked.
//   ?picker            — the notebooks screen, and no notebook reopened
//   ?notebook=<path>   — open this folder, percent-encoded
//   (nothing)          — the first window: whatever the machine remembers

/// What this window was opened to do: `{ kind: "picker" }`,
/// `{ kind: "notebook", path }` or `{ kind: "remembered" }` (the first window,
/// which asks the machine). `search` is a parameter so the rule can be tested.
export function entryOf(search = globalThis.location?.search ?? "") {
  const params = new URLSearchParams(search);
  if (params.has("picker")) return { kind: "picker" };

  // `get` already percent-DEcodes, which is the counterpart of the encoding
  // the Rust side does — a folder may be called anything at all, and a `&` or
  // a `#` in its name would otherwise cut the address in half.
  const path = params.get("notebook");
  // An empty value is not a path: it would reach `open_notebook` as `""` and
  // fail over a folder the user never chose.
  if (path) return { kind: "notebook", path };

  return { kind: "remembered" };
}
