# Making Jott look different

A theme is **one CSS file**. No build step, no JavaScript, no plugin API —
which is why this is the smallest useful contribution to the project and
needs no Rust at all.

> **Today a theme ships with the app**, added by pull request. Loading a
> theme from `.jott/themes/<name>.css` in your own notebook is planned but
> not built — the mechanism is already in place (every theme is loaded at
> once and picked by an attribute), which is why it will not change the
> format below.

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

A role takes a literal value, a `--palette-*` entry, or a `color-mix` of two
of those. One hop, never a chain. Reading any line of a theme tells you what
the colour actually is, instead of sending you through three files. An
architecture test enforces this, so a chain fails `npm test` rather than
being found later.

---

## Writing one

```bash
cp src/styles/themes/default.css src/styles/themes/solarized.css
```

1. **Change the theme name in every selector** — `[data-theme="default"]`
   becomes `[data-theme="solarized"]`. Drop the `:root:not([data-theme])`
   half: that exists only so the factory theme dresses the app before the
   setting has been read.
2. **Assign the roles for both regions.** The list is at the top of
   `default.css`, and it is the whole list — the short version:

   | Role | What it is |
   |---|---|
   | `--theme-bg` | the region's own fill |
   | `--theme-surface`, `--theme-surface-sunken` | the step off it: cards, chips, fields, popovers |
   | `--theme-ink`, `--theme-ink-muted` | text on the ground, and the same ink at 55% |
   | `--theme-on-brand` | text on a filled accent — the region's own ground, so a bright accent takes dark ink |
   | `--theme-hover` | the veil a row lifts with: ink at 8% |
   | `--theme-shadow-popover` | what lifts a menu off the page |
   | `--accent-<name>-1` … `-6` | each of the eight colours as a six-rung ladder, 1 strongest. H1–H6 stand on these rungs |
   | `--accent-<name>`, `-line`, `-tint` | the base (rung 3), a border/focus alpha, and a quiet fill |
   | `--theme-danger`, `-warning`, `-success`, `--theme-emphasis` | four of the eight, straight from the palette, so status never changes meaning with the accent |

3. **Register it** — three lines, in three files:

   ```
   src/app.css                    @import "./styles/themes/solarized.css";
   src/lib/services/themes.js     a line in THEMES
   src/lib/services/strings.js    its label and one-line hint
   ```

4. **`npm test`.** The architecture tests will tell you if a role reads
   another role, if your theme is missing a role the other themes assign, if
   a component reads a role you didn't assign, or if a floating panel doesn't
   get the region's two neutrals swapped. They are the review, and they are
   fast.

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

One role is the same in every theme and both regions: `--accent-<name>-fill`
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
the alternative was letting roles read roles. Making authoring cheaper
without giving up that rule is on the roadmap; a themer's opinion on how
would be welcome in an issue.

## Not a theme, but nearby

Accent colour (any of the eight), heading colour, note font size and three
font choices are **settings**, not themes: they work on top of whichever
theme is on, and they are per machine. A theme should look right under all
eight accents — that's what the ladder is for.
