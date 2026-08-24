# Extending Jott

**There is no plugin API.** Not an oversight, and not entirely undecided —
this page says exactly what is settled, what isn't, and what you can do today
instead.

## What is settled

**Jott will not load third-party code from your notebook folder.** That is
how Obsidian does it (`.obsidian/plugins/*/main.js`), and it means executable
JavaScript living in your *data* directory and syncing to every device you
own — in one real vault, 2.5 MB of it, a single plugin accounting for 564 KB.
The notebook is your files. Nothing in it should be able to run.

So if a plugin format ever ships, it will not be that one.

**Also settled, for the same reason** (the app never writes into your files
something you didn't ask for): no smart typography that rewrites your quotes
and dashes, and no `==highlight==` syntax, which would put HTML and raw hex
into a file that is supposed to be plain Markdown.

## What is not settled

Whether Jott gets an extension surface at all, and what shape it would take.
The strongest candidate is **alternative views of the same list** — a table,
a kanban — reading data v1 already writes, without becoming a new kind of
space. If that arrives as a general mechanism rather than two hard-coded
screens, that mechanism is the plugin story.

If you want this, an issue arguing for a specific case is more useful than a
general request. What would you build?

## What you can do today

**1. Write a theme.** One CSS file, no build step, no Rust:
[`theming.md`](theming.md).

**2. Write a tool against the notebook.** This is the real extension point,
and it always will be: your tasks and notes are Markdown in a folder you
chose, documented in full in [`file-format.md`](file-format.md), and the app
notices when something else edits them. A script that files your tasks, a
static site generator pointed at your notes, a sync job, an importer from
another app — none of that needs Jott's permission, an API key, or a running
process. It just needs the format, and the format is a promise: unknown keys
survive, nothing is destroyed, addresses are relative to the root.

The app itself follows the same discipline — the rules live in a Rust crate
(`core/`) with no knowledge of the interface, which is what makes "another
frontend could exist" a real statement rather than a slogan.

**3. Send a pull request.** For anything that belongs in the app, this is the
shortest path, and it's how features get in today:
[`contributing.md`](contributing.md).

## Settings that already switch things off

Before writing anything, check whether the interface already bends the way
you want. **App functions** in Settings turns whole parts of the interface
off — the task fields you don't use, note banners, wiki links, embeds, note
folders, pinning, tables, even the three fixed spaces — and about fifty
commands have rebindable shortcuts.

Turning something off never hides content: the switch removes what the
interface *draws*, and your files keep everything they had.
