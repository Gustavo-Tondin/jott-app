# Contributing

Jott is a small app with one maintainer, written to be used daily rather than
to grow. That shapes what a good contribution looks like: **fixes, themes and
sharp small features land easily; large features are a conversation first.**

Open an issue before writing anything substantial — not as a formality, but
because a chunk of the design is already decided (see
[the roadmap](../README.md#roadmap) and [`plugins.md`](plugins.md)) and it
would be a waste of your evening to find that out in review.

Bug reports are always welcome. Include your version, your platform, and what
you expected — **not your notebook**: those are your files, and a
reproduction folder with two fake tasks tells us more than your real one.

## Getting set up

```bash
git clone https://github.com/Gustavo-Tondin/jott-app
cd jott-app
npm install
npm run tauri dev
```

Requirements and platform-specific builds: [`building.md`](building.md).
What lives where: [`architecture.md`](architecture.md).

```bash
cargo test    # the rules
npm test      # frontend, screens, architecture
cargo clippy --workspace --all-targets
```

All three must be green. They run in CI before any release is packaged, so a
red suite blocks more than your PR.

## The rules that keep this codebase what it is

Most of these are enforced by a test, so you'll meet them anyway. They're
here so you meet them before the test does.

**1. `core/` never depends on Tauri.** If a business rule only works by
calling something Tauri-shaped, it's in the wrong layer. If a rule only
exists in `src-tauri/`, a second frontend can't see it.

**2. Check whether it already exists.** This codebase pays for reuse: there
is one module for atomic writes, one for relative paths, one for tolerant
JSON config, one for colours, one for dates, one for keyboard chords. A
second implementation of any of them is the failure mode this project works
hardest to avoid. `grep` in `core/src` and `src/lib/services` before writing
a helper — the doc comment on top of each one says what it is for.

**3. Every rule change in `core/` comes with a test.** And where the
integration is the thing that can break, test the real integration — a real
`EditorView`, the real engine. An optional handler nobody wires up raises no
error; only a click finds it.

**4. Nothing is destroyed.** Deletion moves into `.jott/trash/`. Every write
goes through `fsio::write_atomically`, never `fs::write`.

**5. Code and comments in English**, including error messages inside the
code. Commit messages follow [Conventional
Commits](https://www.conventionalcommits.org) — the existing history is in
Portuguese; English is equally fine in a PR.

**6. Comments explain *why*.** The codebase is full of comments recording a
decision, a measurement, or a trap that was walked into once. When you move
code, move the comment with it, byte for byte — rewriting the record of a
decision loses it. A comment describing what the line next to it obviously
does is the only kind that isn't wanted.

**7. No `<style>` blocks in components.** All CSS lives in `src/styles/`,
one file per BEM block, `@layer` ordering the cascade, every length in `rem`
(`px` only for a real device measurement). A component that needs an existing
shape *wears* the shared class (`class="theme-chip suggestions-pill"`) rather
than copying its declarations — a copy is a piece the next pass over the
original will not reach.

**8. Don't bump the version.** It lives in exactly one file and the release
script owns it. Something a user will notice does belong in `CHANGELOG.md`,
under the section for the next version — the release page is built from it,
so write the bullet for someone who has never read this repository.

**9. The file format is a contract.** Changing what the app writes into
somebody's notebook means updating [`file-format.md`](file-format.md) in the
same PR, and thinking about a notebook written by an older version. Unknown
keys survive; that promise is not negotiable.

## Good first contributions

- **A theme.** One CSS file, no Rust: [`theming.md`](theming.md).
- **A bug with a failing test.** The test alone is a real contribution.
- **A gap in this documentation.** If something here was wrong or missing
  when you needed it, that's a fix.
- **Platform reports.** The app is developed on Linux; Windows and Android
  are built and lightly used. A precise report of something behaving wrong
  there is worth a lot.

## What will probably be turned down

Not to be discouraging — to save you the work:

- A plugin system that runs third-party code from the notebook folder, and
  anything that writes into the user's file what they didn't type
  ([why](plugins.md)).
- A graph view, a whiteboard, mindmaps, dashboards, multi-widget spaces —
  cut deliberately, listed in the README.
- A dependency added for something small. The frontend has CodeMirror and
  Svelte; the core has few crates on purpose. "This is 8 lines of stdlib"
  wins here.
- A refactor of code you aren't otherwise touching, or a reformat of a file.
  Diffs are read one change at a time.

## Translations

The interface is English, and every string lives in one table
(`src/lib/services/strings.js`). There is **no i18n layer yet** — translation
is on the roadmap, and the single table is the preparation for it. If you
want to work on that, open an issue first: the shape of the mechanism matters
more than any one language, and getting it wrong would cost every translator
afterwards.

## Licence

By contributing you agree your work ships under the
[MIT License](../LICENSE), like the rest of the project.
