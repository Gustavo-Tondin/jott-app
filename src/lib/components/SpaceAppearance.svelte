<script>
  // The space colour + icon popup, opened from the ⋮ menu (controlled by
  // `open`). A preset palette and, since 2026-09-07, the WHOLE Phosphor set
  // behind a search field — the ten this popup used to offer lead the grid,
  // and the other 1500 are a word away. Picking calls onColor/onIcon with
  // the value — an empty string clears it, back to the default. Stays open
  // across picks so both can be set at once; closes on outside pointer or
  // Escape (swallowed) via onClose.
  import Icon from "./Icon.svelte";
  import AccentPicker from "./AccentPicker.svelte";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import { S } from "../services/strings.js";
  import { leadFirst, loadIconLibrary, searchIcons } from "../services/iconSearch.js";

  let {
    open = false,
    color = null,
    icon = null,
    onColor,
    onIcon,
    onClose,
    /// A space inside a group picks its ICON but not its colour — the
    /// colour is the group's, for the whole section (2026-08-04/08-06).
    colors = true,
  } = $props();

  // The colour row is the shared AccentPicker — the same seven the tag manager
  // and the settings screen offer (2026-08-13). The icons stay here: they are
  // this popup's own vocabulary.
  //
  // The two type defaults lead the grid (services/spaceIcon.js), so the
  // icon a list or a notepad already wears is also the one to pick again;
  // the eight after them are the ones the popup offered before it had a
  // search, kept in front so a hand that knows them finds them where they
  // were. They are also what the grid shows while the library is still on
  // its way — all ten are in the bundle, so the popup never opens empty.
  const LEAD = [
    "list-checks", "notepad", "folder", "house", "check-square", "note",
    "list-bullets", "flag", "sun", "sparkle",
  ];

  // The grid draws a page at a time and grows as it is scrolled: 1512 inline
  // SVGs at once is a noticeable pause on the phone, and the eye reads the
  // first row long before the last would be painted.
  const PAGE = 96;

  let query = $state("");
  let shown = $state(PAGE);
  // The library's entries once read (`raw`: a list of plain objects).
  let library = $state.raw(null);
  let field = $state(null);
  let grid = $state(null);

  // Read the library when the popup opens, once per window
  // (services/iconSearch.js memoises the import).
  $effect(() => {
    if (!open || library) return;
    loadIconLibrary().then((lib) => {
      library = lib.ENTRIES;
    });
  });

  // The field takes the caret on a desktop, where typing is how the popup is
  // used; not under a finger, where focusing would raise the keyboard over
  // the very grid the person wants to look at first.
  $effect(() => {
    if (open && field && !coarsePointer()) field.focus();
  });

  function coarsePointer() {
    return globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  }

  // The one the space wears today rides just behind the ten, so it is on
  // screen the moment the popup opens — `lightbulb` is a long scroll away
  // in the alphabet, and a person changing an icon starts from the old one.
  let lead = $derived(icon && !LEAD.includes(icon) ? [...LEAD, icon] : LEAD);
  let entries = $derived(
    library ? leadFirst(library, lead) : LEAD.map((name) => ({ name, tags: [] })),
  );
  let matches = $derived(searchIcons(entries, query));
  let visible = $derived(matches.slice(0, shown));

  function retyped() {
    shown = PAGE;
    grid?.scrollTo?.(0, 0);
  }

  function scrolled() {
    if (!grid || shown >= matches.length) return;
    const left = grid.scrollHeight - grid.scrollTop - grid.clientHeight;
    if (left < grid.clientHeight) shown += PAGE;
  }
</script>

<div class="palette" use:dismissable={{ active: open, onDismiss: () => onClose?.() }}>
  {#if open}
    <div class="theme-popover theme-popover--end palette__panel" use:keepOnScreen>
      {#if colors}
        <AccentPicker value={color} onPick={(c) => onColor?.(c)} />
      {/if}
      <div class="theme-filter palette__search">
        <Icon name="magnifying-glass" size="1rem" />
        <input
          class="theme-filter__field"
          type="search"
          bind:this={field}
          bind:value={query}
          oninput={retyped}
          placeholder={S.searchIcons}
          aria-label={S.searchIcons}
        />
      </div>
      <div
        class="palette__grid"
        role="group"
        aria-label={S.icon}
        bind:this={grid}
        onscroll={scrolled}
      >
        {#if !query}
          <!-- "No icon of its own" — the type's, like the clear swatch of the
               colour row: the slot is empty because what it stands for is
               whatever the space would wear anyway. -->
          <button
            class="palette__icon palette__icon--clear"
            class:palette__icon--on={!icon}
            aria-label={S.defaultAppearance}
            aria-pressed={!icon}
            onclick={() => onIcon?.("")}
          ></button>
        {/if}
        {#each visible as { name } (name)}
          <button
            class="palette__icon"
            class:palette__icon--on={icon === name}
            aria-label={name}
            aria-pressed={icon === name}
            title={name}
            onclick={() => onIcon?.(name)}
          >
            <Icon {name} size="1rem" />
          </button>
        {/each}
      </div>
      <p class="palette__status" aria-live="polite">
        {matches.length === 0 ? S.iconsNone : S.iconsCount(matches.length)}
      </p>
    </div>
  {/if}
</div>
