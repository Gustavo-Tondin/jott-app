<script>
  // The formatting controls of an open note, framed as a column (the desktop
  // panel), a row (strip above the keyboard, floating bar) or a rail. Every
  // button runs the command of `markdownCommands.js` its chord runs, found by
  // id; the tooltip reads the chord bound NOW. The narrow shapes draw ONE
  // glyph per category and fold the rest behind it — never drop a command.
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
    /// all, so an inherited ground would be the root's.
    region = "canvas",
    /// Command ids this notebook does not draw — `md.reference` with WikiLinks
    /// off, `md.attach` with embeds off. Ids rather than a flag per subject:
    /// the panel only needs to know that this button has nothing to act on.
    hidden = [],
    /// Command ids drawn but GREYED — the table commands while the caret is
    /// outside a table. Greyed rather than hidden: a button that comes and
    /// goes reads as a bar losing buttons.
    inactive = [],
  } = $props();

  /// The commands the panel draws, in registry order — the ones that named an
  /// icon. A command without one is reachable by key and by the settings
  /// screen; the panel is a shortlist, not a mirror of the registry.
  let shown = $derived(
    COMMANDS.filter(
      (command) =>
        command.scope === "editor" && command.icon && !hidden.includes(command.id),
    ),
  );

  /// The folded groups, and what opens each. A group not named here is drawn
  /// flat (right for `history`, the safe default for a new category).
  /// `labelled` writes the name beside each button of the folded panel:
  /// "delete row" and "delete column" are two glyphs nobody tells apart.
  const FOLDED = {
    mark: { icon: "marks", label: () => S.formatMarks },
    heading: { icon: "headings", label: () => S.formatHeadings },
    block: { icon: "blocks", label: () => S.formatBlocks },
    list: { icon: "lists", label: () => S.formatLists },
    insert: { icon: "inserts", label: () => S.formatInsert },
    table: { icon: "table", label: () => S.formatTable, labelled: true },
  };

  const inGroup = (group) => shown.filter((command) => command.group === group);

  /// Every category the panel draws: undoing first, then the registry's own
  /// order. DERIVED, not written out — that is what makes "the bar holds
  /// everything the column holds" true by construction.
  let CATEGORIES = $derived([...new Set(shown.map((command) => command.group))]);
  let NARROW = $derived(
    ["history", ...CATEGORIES.filter((group) => group !== "history")]
      .filter((group) => CATEGORIES.includes(group))
      .flatMap((group) => (FOLDED[group] ? [{ fold: group }] : inGroup(group))),
  );

  let items = $derived(layout === "column" ? shown : NARROW);

  /// Which folded group is open, by name. One at a time: two panels over one
  /// bar would cover the very line being written.
  let openFold = $state(null);

  /// Where a rule goes: between two commands of different `group`, read from
  /// the registry. Neither narrow shape has one — there each category is
  /// already ONE glyph.
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

  /// A button of this bar must never take the focus: the focus is in the
  /// note, and on a phone losing it closes the keyboard and unmounts the strip
  /// before the click lands. Refuse `mousedown`, not `pointerdown`: it is what
  /// moves focus in every engine (a touch gets one too); the click still fires.
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
      <!-- A rule, not a gap: a six-glyph gap reads as a missing button. In the
           column it is full-width, which breaks the wrap — a category always
           starts a row. -->
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
          <!-- PORTALED (`keepOnScreen`): the narrow bar scrolls sideways, and a
               scroller clips its own overflow. The action picks the SIDE (above
               the phone's strip, below the floating bar; a RAIL opens in the
               other axis, `side: "inline"`). `clears` names the BAR, not the button. -->
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
        disabled={inactive.includes(item.id)}
        onclick={() => run(item.id)}
      >
        <Icon name={item.icon} size="1.125rem" />
      </button>
    {/if}
  {/each}
</div>
