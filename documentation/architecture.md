# Architecture

Three layers, and the split between them is the whole design:

```
core/        pure Rust. Every rule about tasks, notes, dates and files.
             Knows nothing about Tauri, nothing about a screen.
src-tauri/   a thin shell that exposes core over invoke(). No rules of its own.
src/         the Svelte frontend, plain CSS, no <style> blocks.
```

**Why the split.** The value being built is in `core/`: it is testable
without a window (`cargo test`, no display, no browser), and a second
frontend — a GTK app, a CLI, a different shell — would inherit every rule
for free. A business rule that only exists in `src-tauri/` is invisible to
that second frontend, which is why the bridge is not allowed to hold any.

---

## `core/` — the rules

| File | What it owns |
|---|---|
| `notebook/` | opening a notebook, and everything you can do to one: spaces, lists, tasks, notes, groups, trash, search, tags, the day and the week |
| `task.rs`, `list.rs` | the task line: parsing, writing, fields, attachments |
| `note.rs`, `notefolder.rs` | the note file: front matter, banner, folders |
| `space.rs` | markers, space types, reserved names |
| `config.rs`, `settings.rs`, `jsondoc.rs` | the notebook's configuration, and the tolerant-JSON policy every config file follows |
| `fsio.rs`, `relpath.rs` | writing files atomically, and addresses that cannot escape the notebook |
| `history.rs` | undo/redo, as a diff of files |
| `trash.rs`, `links.rs`, `assets.rs`, `search.rs`, `clock.rs`, … | one concern each |

Rules that hold across the crate, each with a test behind it:

- **Every write goes through `fsio::write_atomically`.** Never `fs::write` —
  a half-written note is somebody's note, gone.
- **Today comes from `clock`**, never `Local::now()` at a call site. It is
  what makes the day-and-week rules testable at all.
- **Nothing is destroyed.** Deletion is a move into `.jott/trash/`.
- **A config file is tolerant**: absent reads as empty, an invalid value
  falls back to the default, an unknown key survives. One module (`jsondoc`)
  implements that, and every config file uses it.
- **A future `schemaVersion` refuses the write** rather than downgrading it.

## `src-tauri/` — the bridge

One folder, `commands/`, one module per domain — mirroring `core/notebook/`.
`lib.rs` registers a flat list, because the split is about where you look for
a command, not about what the frontend sees.

**A command longer than a handful of lines of invocation is the signal that a
rule ended up in the wrong layer.**

Two things live here legitimately, because they are the platform and not the
domain: `net.rs` (the only outbound HTTP, HTTPS-only and size-bounded),
`base64.rs`, `prefs.rs` (machine preferences, in the OS config folder), and
the window plumbing in `lib.rs`.

**One notebook per window.** State is a map of *window label → notebook*, so
every command that touches a notebook takes a `Window`. That is why change
events go to the owning window rather than broadcast, and why closing a
window has to drop its watcher thread. There is a two-window test in
`src-tauri/tests/bridge.rs`.

A window's own writes do not come back to it as change events. Every write
records the stamp it left behind (`core/src/selfwrite.rs`) together with the
window that is writing on that thread — named by the bridge around every
command that writes — and that window's watcher drops the event while the
file still carries the stamp. A file somebody else touched since no longer
does, and is reported. A second window on the same notebook still hears the
write, which is why the attribution is per window. The owner is written onto
the record the moment the file lands, not when the command returns: on slow
storage the watcher looks before the command is done.

## `src/` — the frontend

| Folder | What it holds |
|---|---|
| `screens/` | one file per screen |
| `spaces/` | the screens a space type can be, plus the registry that picks one |
| `components/` | shared pieces |
| `services/` | logic with no DOM: dates, ordering, markdown, shortcuts, colours, the `api.js` wrapper over `invoke` |
| `shell/` | the window itself: panels, zoom, platform, keyboard insets, tabs |
| `actions/` | Svelte `use:` actions — drag to reorder, dismiss, portal, measure |
| `styles/` | all CSS. Tokens, roles, components, and the themes |

**Adding a command needs both sides**: a line in `generate_handler!` and a
wrapper in `services/api.js`. An architecture test enforces it; a command the
frontend deliberately never calls goes on an explicit list, with its reason.

**There is no `<style>` block anywhere.** Every rule lives in `src/styles/`,
which is what makes theming a matter of one file — see
[`theming.md`](theming.md).

**Measuring instead of guessing.** Start the app with `JOTT_PERF=1` in the
environment (or, on a phone, load the page with `?perf=1` in its address from
DevTools) and `services/perf.js` reports to the console, one `[perf]` line
each: every bridge call with its duration, any editor update over 8 ms, and
any gap between two animation frames over 32 ms. The auto-save fires half a
second after the last keystroke, so what matters is the cost *after a pause*,
not while typing continuously; on Android the lines show up in `adb logcat`.

---

## Tests

```bash
cargo test    # ~560 tests: the rules, plus the bridge
npm test      # ~1040 tests: services, screens, and architecture
```

Three kinds, and they are worth telling apart:

1. **Rule tests** (`core/`) — the majority. A rule without one doesn't ship.
2. **Screen tests** (`src/lib/screenTests/`) — render a real screen, click
   it, and assert what the app did. Shared ground in `test/screens.js`; the
   Tauri bridge is stubbed centrally, and a test that stubs it on its own is
   rejected by an architecture test.
3. **Architecture tests** (`src/lib/architecture.test.js`) — they check the
   things a reviewer would otherwise have to remember: no `<style>` blocks,
   every length in `rem`, no theme role reading another role, every theme
   assigning the same set of roles, the palette hitting its contrast floors,
   both sides of every bridge command, and the version living in exactly one
   file.

**Where an integration is the thing that can break, the test exercises the
real integration** — a real `EditorView`, the real engine — not a fake
context. An optional handler nobody passes raises no error; only a click
finds it.
