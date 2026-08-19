<script>
  // The formatting controls of an open note.
  //
  // One component, framed three ways — the right panel on a desktop, a strip
  // that rides above the keyboard on a phone, and a bar floating over the top
  // of the canvas when the right panel is closed (user calls, 2026-08-18 and
  // 2026-08-19). What it HOLDS is written once; where it sits is the shell's
  // business.
  //
  // Every button presses the very command its chord presses. Not a lookalike:
  // the same function out of `markdownCommands.js`, found by the same id the
  // registry uses. That is what makes the tooltip honest — it reads the chord
  // bound RIGHT NOW, so it keeps telling the truth after a rebinding, which a
  // key written into the button never would.
  //
  // THE TWO SHAPES ARE NOT THE SAME LIST (wireframes "Format panel",
  // 2026-08-19). The column shows every glyph, in rows by category. A narrow
  // bar has room for nine, so two of its buttons are OPENERS: `A` holds the
  // marks and `H` holds the six headings, in a panel that floats above the
  // bar. Folded, not dropped — everything is still one tap away, and the bar
  // stays one line, because a second row would eat the little of the document
  // a phone still shows.
  import Icon from "./Icon.svelte";
  import { COMMANDS, commandById } from "../services/commands.js";
  import { bound } from "../services/shortcuts.js";
  import { formatChord } from "../services/keys.js";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import { S } from "../services/strings.js";

  let {
    /// `(id) => void` — run the command with this id against the open note.
    onRun,
    /// Laid out as a column (the desktop panel) or as a scrolling row (the
    /// strip above the keyboard, and the floating bar).
    layout = "column",
    /// Which ground the folded panel paints itself on. It has to be SAID:
    /// `keepOnScreen` portals that panel to the body, which is in no region at
    /// all, so a panel that inherited its ground came out of the portal
    /// wearing the root's (user report, 2026-08-19 — the marks floated over
    /// the note with no pill at all). The same trap the drawer and the sheets
    /// document.
    region = "canvas",
  } = $props();

  /// The commands the panel draws, in registry order — the ones that named an
  /// icon. A command without one is reachable by key and by the settings
  /// screen; the panel is the shortlist of what a hand reaches for while
  /// writing, not a mirror of the list.
  const shown = COMMANDS.filter((command) => command.scope === "editor" && command.icon);

  /// The two folded groups, and what opens each.
  const FOLDED = {
    mark: { icon: "marks", label: () => S.formatMarks },
    heading: { icon: "headings", label: () => S.formatHeadings },
  };

  const inGroup = (group) => shown.filter((command) => command.group === group);

  /// What the narrow bar draws, in the wireframe's order: undo and redo, the
  /// one indent that earns its place, the two openers, and the four inserts a
  /// note reaches for most.
  const NARROW = [
    "edit.undo",
    "edit.redo",
    "md.indent",
    { fold: "mark" },
    { fold: "heading" },
    "md.bullet",
    "md.code",
    "md.link",
    "md.attach",
  ].map((item) => (typeof item === "string" ? commandById(item) : item));

  let items = $derived(layout === "column" ? shown : NARROW);

  /// Which folded group is open, by name. One at a time: two panels over one
  /// bar would cover the very line being written.
  let openFold = $state(null);

  /// Where a rule goes: between two commands of different `group` (user call,
  /// 2026-08-18). Read from the registry rather than written out here, so a
  /// command added there lands in its own category without this file knowing
  /// the categories at all. The narrow bar has none — it is nine glyphs, not
  /// nineteen, and a rule between every other one is noise.
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
               it opens on, which differs between the two narrow frames: the
               strip sits at the bottom of a phone (so above, clear of the
               keyboard, which it is the one thing that knows how to measure)
               and the floating bar sits at the top of the canvas (so below).

               `clears` names the BAR, not the button: the two are twins, and a
               panel that cleared only the button opened inside the bar's own
               padding, 4px under its edge (user report, 2026-08-19). It stays
               lined up with the button in the other axis, which is what says
               which of the two openers the panel belongs to. -->
          <div
            class="format-bar__panel"
            data-region={region}
            role="group"
            aria-label={opener.label()}
            use:keepOnScreen={{ clears: ".format-bar" }}
          >
            {#each inGroup(item.fold) as command (command.id)}
              <button
                type="button"
                class="theme-btn--icon format-bar__button"
                onmousedown={keepFocus}
                title={hint(command)}
                aria-label={hint(command)}
                aria-keyshortcuts={$bound.get(command.id) ?? undefined}
                onclick={() => run(command.id)}
              >
                <Icon name={command.icon} size="1.125rem" />
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
