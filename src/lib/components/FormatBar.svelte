<script>
  // The formatting controls of an open note.
  //
  // One component, framed four ways — the right panel on a desktop, a strip
  // that rides above the keyboard on a phone, a bar floating over the canvas
  // when the right panel is closed, and that same floating bar stood on end
  // when it hugs the left or the right edge (user calls, 2026-08-18,
  // 2026-08-19 and 2026-08-21). What it HOLDS is written once; where it sits
  // is the shell's business.
  //
  // Every button presses the very command its chord presses. Not a lookalike:
  // the same function out of `markdownCommands.js`, found by the same id the
  // registry uses. That is what makes the tooltip honest — it reads the chord
  // bound RIGHT NOW, so it keeps telling the truth after a rebinding, which a
  // key written into the button never would.
  //
  // THE TWO SHAPES ARE NOT THE SAME LIST (wireframes "Format panel",
  // 2026-08-19). The column shows every glyph, in rows by category. A narrow
  // bar has no room for twenty-three, so it draws ONE glyph per category and
  // folds the category behind it, in a panel that floats above the bar.
  //
  // The rail is the narrow bar STOOD ON END, not a third list: same seven
  // glyphs, same folds, stacked instead of laid out. Two shapes of content,
  // three of arrangement — `column` is the only one that changes what is
  // drawn.
  //
  // Folded, not dropped, and that distinction is the whole point of this round
  // (user report, 2026-08-19: "faltam diversos botões" — the bar used to fold
  // two categories and simply LEAVE OUT six commands of the other four, which
  // read as a bar that had lost buttons). What the column holds, the bar holds;
  // the bar just holds it one tap deeper. It stays one line, because a second
  // row would eat the little of the document a phone still shows.
  //
  // A category of one or two glyphs is drawn FLAT — undoing is the only one
  // today. A fold that holds two buttons costs a tap and saves none.
  import Icon from "./Icon.svelte";
  import { COMMANDS } from "../services/commands.js";
  import { bound } from "../services/shortcuts.js";
  import { formatChord } from "../services/keys.js";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import { S } from "../services/strings.js";

  let {
    /// `(id) => void` — run the command with this id against the open note.
    onRun,
    /// How it is arranged: `column` (the desktop panel, every glyph, wrapped),
    /// `row` (the strip above the keyboard and the floating bar, scrolling
    /// sideways) or `rail` (that same floating bar against a side edge,
    /// stacked). Only `column` changes WHICH glyphs are drawn.
    layout = "column",
    /// Which ground the folded panel paints itself on. It has to be SAID:
    /// `keepOnScreen` portals that panel to the body, which is in no region at
    /// all, so a panel that inherited its ground came out of the portal
    /// wearing the root's (user report, 2026-08-19 — the marks floated over
    /// the note with no pill at all). The same trap the drawer and the sheets
    /// document.
    region = "canvas",
    /// Command ids this notebook does not draw — `md.reference` with WikiLinks
    /// off, `md.attach` with embeds off (App Functions, 2026-08-20). A list of
    /// ids rather than a flag per subject: the panel does not need to know
    /// what a switch is called, only that this button has nothing to act on.
    hidden = [],
    /// Command ids drawn but GREYED — the table commands that only mean
    /// something inside a table, while the caret is outside one
    /// (2026-08-24). Greyed rather than hidden: a button that comes and goes
    /// is a bar that seems to lose buttons, the very report that shaped the
    /// narrow bar.
    inactive = [],
  } = $props();

  /// The commands the panel draws, in registry order — the ones that named an
  /// icon. A command without one is reachable by key and by the settings
  /// screen; the panel is the shortlist of what a hand reaches for while
  /// writing, not a mirror of the list.
  let shown = $derived(
    COMMANDS.filter(
      (command) =>
        command.scope === "editor" && command.icon && !hidden.includes(command.id),
    ),
  );

  /// The folded groups, and what opens each. A group named here folds; one
  /// that is not is drawn flat, which is both right for `history` (two glyphs)
  /// and the safe default for a category added later.
  ///
  /// `always` folds the group in the COLUMN too (user call, 2026-08-24, for
  /// the table): six buttons of which five are greyed most of the time have
  /// no business taking a row of the panel — the one glyph opens them. And
  /// `labelled` writes the name beside each button of that panel: "delete
  /// row" and "delete column" are two glyphs nobody tells apart, and a verb
  /// costs one word.
  const FOLDED = {
    mark: { icon: "marks", label: () => S.formatMarks },
    heading: { icon: "headings", label: () => S.formatHeadings },
    block: { icon: "blocks", label: () => S.formatBlocks },
    list: { icon: "lists", label: () => S.formatLists },
    insert: { icon: "inserts", label: () => S.formatInsert },
    table: { icon: "table", label: () => S.formatTable, always: true, labelled: true },
  };

  const inGroup = (group) => shown.filter((command) => command.group === group);

  /// Every category the panel draws, in the order the narrow bar puts them:
  /// undoing first (the wireframe's lead), then the registry's own.
  ///
  /// DERIVED, not written out — that is what makes "the bar holds everything
  /// the column holds" true by construction rather than by someone remembering
  /// to add a line here. The old list named nine commands by hand, and the six
  /// it did not name were unreachable on a phone.
  let CATEGORIES = $derived([...new Set(shown.map((command) => command.group))]);
  let NARROW = $derived(
    ["history", ...CATEGORIES.filter((group) => group !== "history")]
      .filter((group) => CATEGORIES.includes(group))
      .flatMap((group) => (FOLDED[group] ? [{ fold: group }] : inGroup(group))),
  );

  /// The column: every glyph flat, except the groups that fold everywhere.
  let COLUMN = $derived(
    CATEGORIES.flatMap((group) =>
      FOLDED[group]?.always ? [{ fold: group, group }] : inGroup(group),
    ),
  );

  let items = $derived(layout === "column" ? COLUMN : NARROW);

  /// Which folded group is open, by name. One at a time: two panels over one
  /// bar would cover the very line being written.
  let openFold = $state(null);

  /// Where a rule goes: between two commands of different `group` (user call,
  /// 2026-08-18). Read from the registry rather than written out here, so a
  /// command added there lands in its own category without this file knowing
  /// the categories at all. Neither narrow shape has one — there each category
  /// is already ONE glyph, so a rule between every button would be noise.
  const startsGroup = (index) =>
    layout === "column" && index > 0 && items[index].group !== items[index - 1].group;

  /// `Bold [Ctrl+B]` — the name, and the chord when there is one.
  function hint(command) {
    const chord = $bound.get(command.id);
    return chord ? `${command.label()} [${formatChord(chord)}]` : command.label();
  }

  function run(id) {
    openFold = null;
    onRun?.(id);
  }

  /// A button of this bar must never take the focus (user report, 2026-08-19,
  /// on the phone: "clicking the formatting items closes the keyboard").
  ///
  /// The default action of pressing a button is to focus it, and the focus was
  /// in the note. On a phone that costs three things at once: the soft
  /// keyboard closes, the strip — which is tied to the editor HOLDING the
  /// focus, because with the keyboard down it would float over nothing —
  /// unmounts, and the button being pressed is gone from the document before
  /// its own click can land. Pressing Bold did nothing at all, twice over.
  ///
  /// `mousedown` is the event to refuse, not `pointerdown`: it is the one that
  /// moves the focus in every engine the app runs on, and a touch gets one too
  /// (the compatibility mouse event Chromium synthesises after the tap). The
  /// click still fires — cancelling this default suppresses only the focus.
  const keepFocus = (event) => event.preventDefault();
</script>

<div
  class="format-bar format-bar--{layout}"
  role="toolbar"
  aria-label={S.formatting}
  aria-orientation={layout === "row" ? "horizontal" : "vertical"}
>
  {#each items as item, index (item.fold ?? item.id)}
    {#if startsGroup(index)}
      <!-- A rule, not a gap: three of these groups are six glyphs long, and a
           gap that size reads as a missing button. In the column it is a
           full-width line, which also breaks the wrap onto a new row — so a
           category always starts one. -->
      <span
        class="format-bar__divider"
        role="separator"
        aria-orientation="horizontal"
      ></span>
    {/if}

    {#if item.fold}
      {@const opener = FOLDED[item.fold]}
      <span
        class="format-bar__fold"
        use:dismissable={{
          active: openFold === item.fold,
          onDismiss: () => (openFold = null),
        }}
      >
        <button
          type="button"
          class="theme-btn--icon format-bar__button"
          onmousedown={keepFocus}
          class:format-bar__button--on={openFold === item.fold}
          title={opener.label()}
          aria-label={opener.label()}
          aria-expanded={openFold === item.fold}
          onclick={() => (openFold = openFold === item.fold ? null : item.fold)}
        >
          <Icon name={opener.icon} size="1.125rem" />
        </button>

        {#if openFold === item.fold}
          <!-- PORTALED (`keepOnScreen`), and that is not a nicety: the narrow
               bar scrolls sideways (`overflow-x`), and a scroller clips its own
               overflow — a panel drawn inside it was cut off at the bar's top
               edge, measured in the harness. The action also decides which SIDE
               it opens on, which differs between the narrow frames: the strip
               sits at the bottom of a phone (so above, clear of the keyboard,
               which it is the one thing that knows how to measure) and the
               floating bar sits at the top of the canvas (so below). A RAIL
               opens in the other axis entirely — `side: "inline"` — because
               above and below a column of seven buttons there is no room at
               all, and beside it there is nothing but document.

               `clears` names the BAR, not the button: the two are twins, and a
               panel that cleared only the button opened inside the bar's own
               padding, 4px under its edge (user report, 2026-08-19). It stays
               lined up with the button in the other axis, which is what says
               which of the openers the panel belongs to. -->
          <div
            class="format-bar__panel"
            class:format-bar__panel--beside={layout === "rail"}
            class:format-bar__panel--labelled={opener.labelled}
            data-region={region}
            role="group"
            aria-label={opener.label()}
            use:keepOnScreen={{
              clears: ".format-bar",
              side: layout === "rail" ? "inline" : undefined,
            }}
          >
            {#each inGroup(item.fold) as command (command.id)}
              <button
                type="button"
                class="theme-btn--icon format-bar__button"
                class:format-bar__button--labelled={opener.labelled}
                onmousedown={keepFocus}
                title={hint(command)}
                aria-label={hint(command)}
                aria-keyshortcuts={$bound.get(command.id) ?? undefined}
                disabled={inactive.includes(command.id)}
                onclick={() => run(command.id)}
              >
                <Icon name={command.icon} size="1.125rem" />
                {#if opener.labelled}
                  <span class="format-bar__label">{command.label()}</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </span>
    {:else}
      <button
        type="button"
        class="theme-btn--icon format-bar__button"
        onmousedown={keepFocus}
        title={hint(item)}
        aria-label={hint(item)}
        aria-keyshortcuts={$bound.get(item.id) ?? undefined}
        onclick={() => run(item.id)}
      >
        <Icon name={item.icon} size="1.125rem" />
      </button>
    {/if}
  {/each}
</div>
