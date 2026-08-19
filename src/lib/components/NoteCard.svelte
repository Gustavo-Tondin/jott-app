<script>
  // One note on the board (wireframes "Notes screen - default", "Space Notes",
  // "Notes Screen - mobile").
  //
  // A card is its banner, its title on a chip over the banner's bottom edge,
  // and the first lines of its text. A note with no banner is the same card
  // without the coloured block — the title reads as a title on its own, which
  // is what "sem banner a nota fica só com título" means on the board too.
  //
  // The card only ever DRAWS. Opening, picking, pinning and the ⋮'s items are
  // the board's business (spaces/NotesSpace.svelte), because they are the same
  // gestures whether the card sits on a board or inside a folder card.
  import { S } from "../services/strings.js";
  import { accentFill } from "../services/accent.js";
  import { assetUrl } from "../services/assets.js";
  import Menu from "./Menu.svelte";
  import Icon from "./Icon.svelte";

  let {
    /// A `NoteEntry` from the bridge.
    entry,
    /// The notebook's root, for an image banner's URL.
    root = null,
    /// Picking mode: a click chooses the card instead of opening it, and the
    /// chosen ones are tinted (the same pact the task cards keep).
    picking = false,
    selected = false,
    /// The ⋮'s items, or an empty list for no ⋮ at all.
    menu = [],
    /// Smaller, for the cards drawn INSIDE a folder card: title only, no
    /// banner, no menu.
    small = false,
    /// `() => void` — pinning, beside the ⋮ (user call, 2026-08-19: "com a
    /// mesma funcionalidade das tarefas"). It is a button of its own and not
    /// only a menu item because a pin is a STATE: the card has to say whether
    /// it is pinned without being asked, and the drawn pin is what says it.
    /// Null draws none.
    onPin = null,
    onOpen,
  } = $props();

  let banner = $derived(entry.banner ?? null);
  let isImage = $derived(banner?.kind === "image");
  let src = $derived(isImage ? assetUrl(root, banner.value) : "");
  let tint = $derived(banner?.kind === "color" ? accentFill(banner.value) : null);
</script>

<article
  class="note-card"
  class:note-card--small={small}
  class:note-card--picked={selected}
  class:note-card--pinned={entry.pinned}
>
  <button
    class="note-card__open"
    aria-pressed={picking ? selected : undefined}
    onclick={() => onOpen?.(entry)}
  >
    {#if banner && !small}
      <span
        class="note-card__banner"
        class:note-card__banner--image={isImage}
        style={tint ? `--banner: ${tint}` : ""}
      >
        {#if isImage}
          {#if src}
            <img class="note-card__image" src={src} alt="" />
          {:else}
            <!-- The address points at a picture that is not there any more (it
                 was deleted, or the notebook travelled without it). The card
                 says so with the placeholder the wireframe draws rather than
                 collapsing, so the note is still recognisable. -->
            <span class="note-card__missing" title={S.missingImage}>
              <Icon name="image" size="1.5rem" />
            </span>
          {/if}
        {/if}
      </span>
    {/if}

    <span class="note-card__title" class:note-card__title--chip={banner && !small}>
      {entry.title}
    </span>

    {#if !small}
      <span class="note-card__preview">{entry.preview || S.emptyNote}</span>
    {/if}
  </button>

  {#if (onPin || menu.length > 0) && !picking}
    <div class="note-card__tools">
      {#if onPin}
        <button
          class="theme-btn--icon note-card__pin"
          class:note-card__pin--on={entry.pinned}
          aria-pressed={!!entry.pinned}
          aria-label={entry.pinned ? S.unpin : S.pin}
          title={entry.pinned ? S.unpin : S.pin}
          onclick={() => onPin()}
        >
          <!-- The same glyph a pinned TASK carries (components/TaskRow.svelte):
               one mark for "kept at the top", whatever it is pinned to. -->
          <Icon
            name={entry.pinned ? "bookmark-simple-fill" : "bookmark-simple"}
            size="1rem"
          />
        </button>
      {/if}
      {#if menu.length > 0}
        <Menu items={menu} align="end">
          {#snippet trigger({ toggle })}
            <button
              class="theme-btn--icon note-card__more"
              onclick={toggle}
              aria-label={S.noteOptions}
              title={S.noteOptions}
            >
              <Icon name="dots-three" size="1rem" />
            </button>
          {/snippet}
        </Menu>
      {/if}
    </div>
  {/if}
</article>
