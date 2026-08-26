# Making Jott look different

A theme is **one CSS file**. No build step, no JavaScript, no plugin API —
which is why this is the smallest useful thing you can make for Jott, and it
needs no Rust at all.

There are two places a theme can live, and the file is the same either way:

- **In your notebook**, under `.jott/themes/`. Nobody else has to agree —
  drop it in, pick it in Settings, and it travels with the notebook to your
  other machines. Start here.
- **In the app**, by pull request, if you think everyone should have it.

## The quickest path: let the app write the first one

Settings → Display → **New theme from this one**. It asks for a name and
writes `.jott/themes/<name>/` into your notebook, containing the look you are
wearing right now — every role already assigned, in the right shape. Then
open `theme.css` in any editor and change colours. **Saving the file repaints
the app**, so the loop is: save, look, save again.

That button exists because of a real cost: a theme assigns both regions in
full, which is around 170 declarations. Typing those out of this page is not
something anybody does; editing a file that already works is.

## Bringing one in by hand

Two shapes, both read from `.jott/themes/`:

```
.jott/themes/
├── solarized.css          ← a loose file. This is a complete theme.
└── blue-topaz/
    ├── theme.css          ← the same thing, in a folder…
    └── manifest.json      ← …which lets it say who made it
```

The **name** is the file's (without `.css`) or the folder's, and that is what
Settings shows and what the notebook stores. `default`, `light` and `dark`
are refused — the app already answers to those, and a theme by that name
could never be worn.

`manifest.json` is optional and every key in it is optional:

```json
{
  "name": "Blue Topaz",
  "author": "Someone",
  "version": "2.1.0",
  "minAppVersion": "0.37.0"
}
```

`minAppVersion` is the one worth writing. A theme made for a newer Jott will
still load, but the app can then say so on the row instead of leaving you to
wonder why half the window looks wrong.

### Two things Jott does to your stylesheet

**Anything that would reach the network is neutralised on the way in.** A
remote `@import` is dropped; a `url()` pointing at a host becomes
`url("about:invalid")`, which keeps the declaration valid and makes no
request. Settings says how many were blocked. A stylesheet is text the app
injects into its own window, and a theme downloaded from a stranger should
not be able to call home every time you open your notes. `data:` URIs are
left alone — that is how a self-contained theme carries an image.

**A stylesheet past 4 MB is refused** rather than injected.

---

## The idea in one screen

The app has no "mode". It has **two regions**, and each declares its own
ground:

```
[data-region="chrome"]   title bar · tab strip · sidebar · right panel
[data-region="canvas"]   the content panel in the middle
```

The factory theme is a black chrome around a white canvas, and that contrast
is the app's face. A theme is free to make both grounds dark, both light, or
anything else — it just has to say so for each region.

**One rule the whole design depends on:**

> **No role reads another role.**

A role takes a literal value, a `--theme-color-*` entry, or a `color-mix` of two
of those. One hop, never a chain. Reading any line of a theme tells you what
the colour actually is, instead of sending you through three files. An
architecture test enforces this, so a chain fails `npm test` rather than
being found later.

---

## What a theme has to assign

Whichever of the two places it lives in, a theme is the same file — and it
**replaces** the colours rather than patching them. That is the contract that
keeps every role one hop from a real colour instead of a chain through three
files.

Selectors differ by destination, and only in the first line of each rule:

| Living in | Rule reads | Why |
|---|---|---|
| your notebook | `[data-region="chrome"] { … }` | `data-theme` carries your theme's name, so no theme the app ships matches — yours is the only one painting. Renaming the folder cannot break it. |
| the app | `[data-theme="solarized"] [data-region="chrome"] { … }` | every theme the app ships is loaded at once, and the attribute picks |

A notebook theme *may* use the keyed form too, as long as the name matches
its folder — which is why a theme copied out of the app works unchanged.

**Assign the roles for both regions.** The list is at the top of
   `default.css`, and it is the whole list — the short version:

   | Role | What it is |
   |---|---|
   | `--app-bg` | the region's own fill |
   | `--app-surface`, `--app-surface-sunken` | the step off it: cards, chips, fields, popovers |
   | `--app-ink`, `--app-ink-muted` | text on the ground, and the same ink at 55% |
   | `--app-on-brand` | text on a filled accent — the region's own ground, so a bright accent takes dark ink |
   | `--app-hover` | the veil a row lifts with: ink at 8% |
   | `--app-shadow-popover` | what lifts a menu off the page |
   | `--app-<name>-1` … `-6` | each of the eight colours as a six-rung ladder, 1 strongest. H1–H6 stand on these rungs |
   | `--app-<name>`, `-line`, `-tint` | the base (rung 3), a border/focus alpha, and a quiet fill |
   | `--app-danger`, `-warning`, `-success` (+ `-tint`), `--app-emphasis` | four of the eight, straight from the palette, so status never changes meaning with the accent; the `-tint` is the quiet fill behind a notice |

### The four colour roles

Where a colour the person chose ends up is not free-form — the interface
keeps one form per role, so a blue dot, a blue badge and a blue block never
mean the same thing:

| Role | Question it answers | Who carries it | The one form |
|---|---|---|---|
| **origin** | where did this come from? | a space (its group's colour wins) | the sidebar's bar, the tab's dot — and, outside the space, a **badge** with the space's name: outline on `--app-<name>-line`, text on rung 2 |
| **subject** | what is it about? | a tag | the same badge, **neutral** — `#tag` in `--app-ink-muted` on `--app-line`; a tag has no colour of its own |
| **surface** | the face of a thing | a note's banner (`-fill`, step 300), a folder of notes (`-tint`), a notebook's card (`-solid`, step 500) | a fill; the picker previews the step it will paint with |
| **status** | urgent? wrong? | priority, an overdue date, a notice | `--app-danger` / `-warning` / `-success`, fixed — never one of the eight by name |

The rule that holds it together: **a card carries at most one colour of the
palette, and it is its space's.** Everything else on it is neutral or status.
A theme that wants the badge to look different restyles `.theme-badge`
(`--badge-color`, `--badge-line`).

### Changing what the eight colours are

Most of the file is them: each of the eight, as a ladder, for each region.
They are ordinary values — a theme that wants its own palette writes literals
and never mentions `--theme-color-*`. Three things to know before you do:

- **Which of the eight is the accent stays the reader's choice** (Settings →
  Display), never the theme's. A theme says what `blue` *looks like*; the
  person says whether the app wears blue. Assigning `--app-brand` takes
  that away.
- **The ladder runs 1 (strongest) → 6 (faintest), and H1–H6 stand on those
  rungs in order.** Keep it monotonic or headings stop agreeing with their
  own size.
- **`--app-<name>-fill` is not in the theme file** — it is the same in
  every theme and both regions, because a banner is a surface with nothing
  written on it and a yellow note should be yellow under any lamp. A notebook
  theme can still override it (`:root { --app-yellow-fill: #e8d9a0; }`),
  since it is loaded after everything else.

### If your theme ships with the app

Three more lines, in three files:

```
src/app.css                    @import "./styles/themes/solarized.css";
src/lib/services/themes.js     a line in THEMES
src/lib/services/strings.js    its label and one-line hint
```

Then **`npm test`.** The architecture tests will tell you if a role reads
another role, if your theme is missing a role the other themes assign, if a
component reads a role you didn't assign, or if a floating panel doesn't get
the region's two neutrals swapped. They are the review, and they are fast.
(They only see themes in the repository — a notebook theme is yours, and
nothing checks it but your eyes.)

---

## The two things that surprise people

**The ladder walks in half steps.** Each colour runs 100 (lightest) → 700
(darkest) on one tonal grid, and six *pure* steps do not fit: past 500 on a
dark ground the ramp is out of contrast — invisible, not weak. So six rungs
come out of four steps, and the halves are `color-mix(in oklab, <step>,
<next>)`, still one hop from the palette. Rung 6 is faint on purpose; it is
the only one that is.

Which end a region reads from is the whole trick:

```
ON A DARK GROUND  → ink white; ladder 200→450, base 300, line 500 @45%, tint 700
ON A LIGHT GROUND → ink black; ladder 600→350, base 500, line 300 @60%, tint 100
```

**`neutral` is the eighth colour, and it reads one step further out.** It is
the white↔black family, so its ramp runs along the same axis as the app's
two grounds: taking the same steps as a hue would make its first rung a grey
instead of white, and its tint the ground itself. Everything else about it is
ordinary.

One role is the same in every theme and both regions: `--app-<name>-fill`
(step 300). A banner is a surface with nothing written on it — a yellow note
is yellow under any lamp.

---

## Where things live

```
src/styles/
├── tokens.css        the palette (8 colours × 7 steps) and the metric scales
├── roles.css         the roles that are the same everywhere, and the two
│                     runtime choices: which colour is the accent, and whether
│                     headings take it
├── themes/*.css      one file per theme: the colours, per region
├── controls.css      the shared .theme-* controls
└── components/*.css  one file per BEM block
```

Two conventions that will bite if you don't know them:

- **`editor.css` is the only sheet outside `@layer`, and it has to be.**
  CodeMirror injects its base theme as an unlayered `<style>` at the top of
  `<head>`, and unlayered declarations beat layered ones regardless of
  specificity. In a layer, our rules would lose silently.
- **`:global(…)` is forbidden in `src/styles/`.** It is Svelte `<style>`
  syntax, and this project has no `<style>` blocks. To a browser it is an
  unknown pseudo-class, and the whole rule is discarded.

**The honest downside**, so you know before you start: a theme is ~50
assignments per region, most of them mechanical. It is verbose by design —
the alternative was letting roles read roles, and then no line of a theme
would tell you what a colour actually is. "New theme from this one" is the
answer to the typing; making the *file* smaller without giving up the rule is
still open, and a themer's opinion on how would be welcome in an issue.

## Not a theme, but nearby

Accent colour (any of the eight), heading colour, note font size and three
font choices are **settings**, not themes: they work on top of whichever
theme is on, and they are per machine. A theme should look right under all
eight accents — that's what the ladder is for.
