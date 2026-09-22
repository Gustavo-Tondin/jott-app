# Contributing

Jott is a small app with one maintainer, written to be used daily rather than
to grow. That shapes what a good contribution looks like: **fixes, themes and
sharp small features land easily; large features are a conversation first.**

Open an issue before writing anything substantial — not as a formality, but
because a chunk of the design is already decided (see
[the roadmap](../README.md#roadmap) and [`plugins.md`](plugins.md)) and it
would be a waste of your evening to find that out in review.

Loose ideas and questions go to
[Discussions](https://github.com/Gustavo-Tondin/jott-app/discussions) first.

Bug reports are always welcome through the
[issue form](https://github.com/Gustavo-Tondin/jott-app/issues/new/choose),
which asks for your version, your platform, and what you expected. Leave out
**your notebook**: those are your files, and a
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

**5. Comments state the contract, not the story.** A comment says what a
piece guarantees or the non-obvious trap it avoids, in a few lines. How the
code got that way — dates, bug reports, what it used to do — does not
belong in the source; keep it in the commit message. A file header is five
lines at most.

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
  cut deliberately, and not coming back.
- A dependency added for something small. The frontend has CodeMirror and
  Svelte; the core has few crates on purpose. "This is 8 lines of stdlib"
  wins here.
- A refactor of code you aren't otherwise touching, or a reformat of a file.
  Diffs are read one change at a time.

## Adding a language

The interface is written in English, in one table
(`src/lib/services/strings.js`). A language is a dictionary beside it:

1. **`src/lib/locales/<tag>.js`**, named by its BCP 47 tag (`pt-BR`, `es`).
   Each key mirrors `strings.js` and holds a pair: the English it was
   translated *from*, then the translation —
   `today: ["Today", "Hoje"]`. A key whose text takes values is a function
   in both halves; copy the English one byte for byte and translate the
   second. Keep the order and section comments of `strings.js`, so the two
   files diff alike. `pt-BR.js` is the worked example.
2. **One line in `LANGUAGES`** (`src/lib/locales/index.js`), with the
   language's name written in that language.
3. **One case in `Lang`** (`core/src/lang.rs`): how a system locale maps to
   it, and its tag. The compiler then points at the few strings Rust draws
   itself — the tray menu (`src-tauri/src/tray.rs`) and the desktop
   notifications (`src-tauri/src/ringer.rs`, where `words::place`, the name
   of the fixed Tasks space, falls through a wildcard and needs its case by
   hand) — and the launcher entry takes
   `GenericName`, `Comment` and `Keywords` lines with `[<locale>]` in
   `packaging/linux/jott.desktop`.

`npm run i18n` shows what is left: the share translated, and each key that
is missing, stale, orphaned or malformed. `npm test` runs the same audit; a
missing key or a stale sentence only reports, everything else fails.

**Why the English sits next to each translation.** Text changes. When a
sentence in `strings.js` is reworded, its pair no longer matches, and the
app shows the new English there instead of a translation of the old one —
nobody reads a stale sentence, and `npm run i18n` lists the key as *stale*
until someone updates it. A missing key falls back to English the same
way, so a language can land half done. A function or a list whose English
changed is different: the app cannot fall back on part of it, so the test
fails until the pair is brought up to date.

What is never translated is what lands on disk: the names of Jott's own
files and folders, and the keys and values of the file format
([`file-format.md`](file-format.md)). A notebook written in one language
opens unchanged in another.

## Licence

By contributing you agree your work ships under the
[MIT License](../LICENSE), like the rest of the project.
