# Making Jott look different

A theme is **one CSS file**. No build step, no JavaScript, no plugin API —
which is why this is the smallest useful thing you can make for Jott, and it
needs no Rust at all.

Since 2026-08-26 there are two separate questions, and a theme answers only
one of them:

- **Mode** — *jott* (black frame, white page; Settings calls it
  **Contrast**), *light*, *dark*. The app's own three; a setting, per machine.
- **Theme** — the palette: the colours, the spacing scale, the radius
  ladder. The app ships one (`jott`), and **a theme wears any mode**: write
  the colours once and they work light, dark and jott.

There are two places a theme can live, and the file is the same either way:

- **In your notebook**, under `.jott/themes/`. Nobody else has to agree —
  drop it in, pick it in Settings, and it travels with the notebook to your
  other machines. Start here.
- **In the app**, by pull request, if you think everyone should have it.

## The quickest path: edit the one that is already there

Every notebook carries the app's own palette as a file: **`.jott/themes/jott.css`**.
The app writes it the first time it opens the notebook and never overwrites
what you changed in it: only a copy nobody touched is brought up to date when
the app's palette changes. Open it, change a colour, save — **the app
repaints**. Delete it and the
next open brings the factory one back. That file is the whole contract: about
a hundred `--theme-*` tokens in one `:root { … }`.

To keep the factory palette and make another: Settings → Display → Theme →
**New theme from this one…** (the last option of the drop-down, on the
desktop). It asks for a name, writes `.jott/themes/<name>/` with the palette
you are wearing right now, in the same shape, puts it on and opens the folder.

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
Settings shows and what the notebook stores. `jott`, `default`, `light` and
`dark` are refused: the app already answers to those, and a theme by that
name could never be worn.

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

Three layers, one hop between each:

```
THEME   what you write            :root { --theme-color-brand-300: #66a3ff; … }
  │     a mode is the function between the two, per region
MODE    what the app ships        [data-mode="dark"] [data-region="chrome"] {
                                    --app-bg: var(--theme-color-black);
                                    --app-1-ink: var(--theme-color-1-300); … }
  │
APP     what a component reads    .theme-badge--tag { color: var(--app-brand-ink); }
```

A **theme** writes `--theme-*` and nothing else. It knows nothing about
regions, modes or roles. A **mode** reads the theme's tokens and decides
what goes where, for the app's two regions:

```
[data-region="chrome"]   title bar · tab strip · sidebar
[data-region="canvas"]   the content panel in the middle · right panel
```

The jott mode is a black chrome around a paper canvas, and that contrast is
the app's face; light and dark paint both regions the same way. A
**component** reads `--app-*` only.

**One rule the whole design depends on:**

> **No role reads another role.**

A mode assigns each `--app-*` from a `--theme-*` token or a `color-mix` of
two; a theme assigns each `--theme-*` a literal. One hop per layer, never a
chain. Architecture tests enforce every edge of this triangle — a component
reading `--theme-*`, a mode writing `--theme-*`, a theme reading anything —
so a mistake fails `npm test` rather than being found later.

---

## What a theme declares

The contract is the factory file, `styles/themes/jott.css` in the repository
and `.jott/themes/jott.css` in your notebook. The app writes that copy once
and never over your edits: only a copy that is still, byte for byte, the
palette of an older build is replaced by the current one. A theme declares what it wants;
whatever it leaves out keeps the factory value, because the factory palette
is always loaded underneath.

| Group | Tokens | How many |
|---|---|---|
| grounds | `--theme-color-white`, `-white-tint`, `-black`, `-black-tint`, `-gray` | 5 |
| the brand | `--theme-color-brand-<100…700>` | 7 |
| the seven | `--theme-color-<1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 7>-<100 300 500 700>` | 28 |
| status | `--theme-color-<danger \| warning \| success>-<100 200 300 500 700>` | 15 |
| shape | `--theme-radius-<xs \| sm \| md \| lg \| xl \| xxl \| pill>`, `--theme-space-<2 4 6 8 10 12 16 24 32 40 48 64>` | 19 |

Things worth knowing before you change them:

- **Every colour sits on one tone grid** (100 palest → 700 deepest), and the
  modes read a *step*: 300 for every fill and for ink on a dark ground, 500
  for ink on a light one, 200/600 for emphasis, 100/700 for the quiet fills.
  The brand runs all seven steps, because the headings stand on it; a place
  is never a heading, so the seven run the four they are read at (100, 300,
  500, 700). Keep the grid and the whole app follows; break it and a
  heading may stop clearing its ground. Four steps are pinned to a contrast
  floor: 200/600 at 7:1, 300/500 at 4.5:1 against their ground. (Tests
  measure the factory file; a notebook theme is yours, and nothing checks it
  but your eyes.) The factory theme leaves the grid in one place on purpose:
  its red, and `danger` with it, runs darker from 200 to 500, because a red
  at the grid's tone is salmon. The floors still hold.
- **The brand is the app's own colour, and nobody picks it.** It is what an
  action and "now" wear: the chosen day, the button that creates, a link, a
  focus ring. `--app-brand-solid` (step 500) under `--app-brand-on-solid` is
  the one strong fill. It is never the colour of a place.
- **The seven slots are the colours of PLACES, and they are NUMBERED, not
  named.** A space, a group, a banner and a notebook's card pick among them.
  They walk the wheel from blue (1 blue, 2 violet, 3 pink, 4 red, 5 orange,
  6 yellow, 7 green in the factory theme); what each looks like is yours to
  decide, which is the whole point — a palette that paints slot 6 lilac
  should not have to keep calling it "yellow". The word a person reads in a
  menu is a label, not the identity.
- **Status is its own three families, and they run FIVE steps.** `danger`,
  `warning`, `success` are seeded from red, yellow and green, but they are
  separate tokens: make your `red` sea-green and the error notice stays red —
  unless you change `danger` too. A status
  colour is ink (300 on a dark ground, 500 on a light one), the wash behind
  it (700/100), or a fill (200 on both grounds: a swipe's square, a priority
  swatch); a notice's glyph on its wash reads `-on-tint`, which for the
  warning leans amber on the light ground. It is never a heading, so it has
  no ladder. Two marks of a note read these families too: italic text is
  `success` ink, and inline code is
  `danger` ink with its hue turned 15° toward orange (same tone and chroma),
  so changing `danger` moves it too.
- **Spacing and radius are the theme's too.** A squarer or roomier Jott is a
  theme, not a fork.

### The four colour roles

Where a colour the person chose ends up is not free-form — the interface
keeps one form per role, so a blue bar, a blue badge and a blue block never
mean the same thing:

| Role | Question it answers | Who carries it | The one form |
|---|---|---|---|
| **origin** | where did this come from? | a space (its group's colour wins) | the space's icon in the sidebar, the tab's dot and, outside the space, a dot in its colour beside its name on a card, or a bar on the row's left edge (`.theme-origin`) in a list of results |
| **subject** | what is it about? | a tag | a **badge** (`.theme-badge`): a tag has no colour of its own; on the item that carries it the `#tag` wears the brand's ink (`.theme-badge--tag`), and it is neutral in the tag manager |
| **surface** | the face of a thing | a note's banner (`-fill`), a folder of notes (`-tint`), a notebook's card (`-solid`) | a fill; the picker previews the step it will paint with |
| **status** | urgent? wrong? | priority, an overdue date, a notice, a swipe's square | `--app-danger` / `-warning` / `-success` for ink, plus `-fill`, `-tint` and `-on-tint`, read from the theme's own status families — never one of the seven by name |

The rule that holds it together: **a card carries at most one colour of the
palette, and it is its space's.** Everything else on it is neutral or status.
A theme that wants the badge to look different restyles `.theme-badge`
and `.theme-badge--tag`, and the bar `.theme-origin`.

### Going further: a full theme

A theme file may also write `--app-*` roles, or restyle any `.theme-*`
control or BEM block. It is injected at the end of `<head>` and outside every
layer, so it wins over the modes and over `roles.css` — that is how a theme
reaches the fill roles, which the modes keep the same on every ground. Two
things to know:

- A full theme keyed on its own name (`[data-theme="mine"] [data-region="chrome"] { … }`)
  is named on the root only after its stylesheet is in the document; a
  palette-only theme needs no key at all.
- **What a mode assigns** is what `styles/modes/jott.css` writes, and it is
  the whole list: the two grounds and the ink, the brand with its six-rung
  ladder (`--app-brand-1…-6`, 1 strongest; H1–H6 stand on these rungs), each
  of the seven as a mark with its `-ink` and `-tint`, the status roles and
  their `-fill`, `-tint` and `-on-tint`, the hover veil and the popover
  shadow.

### You do not have to write every token

`src/styles/themes/make-theme.py` writes a whole theme from a handful of
colours you like. It reads the HUE of each colour you give and rebuilds that
family on the tone grid, so the tones and the contrast promises come out right
even when your pick was a muddy screenshot swatch:

```
./make-theme.py --name midnight --ground "#16151a" \
    --brand "#2557e5" --4 "#e5484d" --7 "#30a46c" -o midnight.css
```

Any slot you leave out keeps the factory hue. `--check <file>` re-measures an
existing theme and names the steps that miss a floor, which is the same thing
the app's own suite does. It needs only Python's standard library.

Where a hue cannot be both dark and saturated, it says so rather than write a
theme that fails quietly — yellow is the usual one, because no yellow is both
readable on white and still yellow.

### If your theme ships with the app

A palette is one file, `src/styles/themes/<name>.css`, plus the Settings
line that offers it. A new *mode* is three lines in three files:

```
src/app.css                    @import "./styles/modes/<name>.css";
src/lib/services/themes.js     a line in MODES
src/lib/services/strings.js    its label and one-line hint
```

Then **`npm test`.** The architecture tests will tell you if a role reads
another role, if your mode is missing a role the other modes assign, if a
component reads a role nobody assigns, or if a floating panel doesn't get
the region's two neutrals swapped. They are the review, and they are fast.

---

## The two things that surprise people

**The ladder walks in half steps.** The brand runs 100 (lightest) → 700
(darkest) on one tonal grid, and six *pure* steps do not fit: past 500 on a
dark ground the ramp is out of contrast — invisible, not weak. So six rungs
come out of four steps, and the halves are `color-mix(in oklab, <step>,
<next>)`, still one hop from the palette. Rung 6 is faint on purpose; it is
the only one that is.

Which end a region reads from is the whole trick:

```
ON A DARK GROUND  → ink white; ladder 200→450, ink 300, tint 700
ON A LIGHT GROUND → ink black; ladder 600→350, ink 500, tint 100
```

### A mark is one colour; only ink has two halves

`--app-<name>` is the colour as a **mark** — a dot, a pill, a bar, a banner,
a button's fill — and it is step 300 in every mode and both regions. Nothing
is read off a mark, so it has no contrast to protect, and a yellow note is
yellow under any lamp. The ink over any of them is `--app-on-brand`
(`--app-on-solid` on a card), the dark ground, which clears 4.5:1 on all
seven.

`--app-<name>-ink` is the colour as something **read** — a word, a hairline, a
focus ring, a caret — and that one still answers the region: the palette's
step 300 on a dark ground, 500 on a light one. Assign both: a mode that writes
only the mark leaves every coloured word at the mark's contrast, which on a
light ground is 2.2:1.

---

## Where things live

```
src/styles/
├── themes/jott.css   THE THEME: the palette (the brand and 7 place colours
│                     × 7 steps, 3 status × 5, the grounds), the spacing and
│                     radius scales —
│                     `--theme-*`, literals only. Written into notebooks.
├── modes/*.css       one file per MODE: `--app-*` per region, read from
│                     the theme's tokens
├── roles.css         the shared mode: the roles that are the same in every
│                     mode, and the one runtime choice (whether headings
│                     take the brand or the ink)
├── tokens.css        the app's structural vocabulary — type, layout,
│                     motion — as `--app-*`; spacing and radius point at
│                     the theme's
├── controls/*.css    the shared .theme-* controls, one family per sheet
│                     (forms, buttons, marks, overlays, layout, feedback, motion)
└── components/*.css  one file per BEM block
```

Two conventions that will bite if you don't know them:

- **The `editor*.css` sheets (`editor.css`, `editor-search.css`,
  `editor-tables.css`) are the only component sheets outside `@layer`, and
  they have to be.** CodeMirror injects its base theme as an unlayered `<style>` at the
  top of `<head>`, and unlayered declarations beat layered ones regardless of
  specificity. In a layer, our rules would lose silently. (The modes are
  unlayered too, by design, and `themes/jott.css` is plain `:root` so the
  bytes on disk match the bundle — `app.css` puts it in the tokens layer.)
- **`:global(…)` is forbidden in `src/styles/`.** It is Svelte `<style>`
  syntax, and this project has no `<style>` blocks. To a browser it is an
  unknown pseudo-class, and the whole rule is discarded.

## Not a theme, but nearby

The mode, the heading colour, the note font size and the three font choices
are **settings**, not themes: they work on top of whichever theme is on, and
they are per machine. A theme should look right under all three modes — that
is what the tone grid and the ladder are for.
