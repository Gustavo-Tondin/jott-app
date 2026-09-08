<script>
  // One note on the board: its banner, its title on a chip over the banner's
  // bottom edge, and the first lines DRAWN as markdown (NotePreview). A note
  // with no banner is the same card without the block. The card only ever
  // DRAWS: opening, picking, pinning and the ⋮'s items are the board's; the
  // middle and right buttons only report WHICH card was asked for.
  import { S } from "../services/strings.js";
  import { accentFill } from "../services/accent.js";
  import { assetUrl } from "../services/assets.js";
  import { ageStamp, noteSince } from "../services/age.js";
  import { isUntitled } from "../services/noteTitle.js";
  import Menu from "./Menu.svelte";
  import Icon from "./Icon.svelte";
  import NotePreview from "./NotePreview.svelte";
  import Badge from "./Badge.svelte";

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
    /// `() => void` — pinning, beside the ⋮. A button of its own and not only
    /// a menu item because a pin is a STATE the card has to show without
    /// being asked. Null draws none.
    onPin = null,
    /// `(entry, {newTab}) => void` — the click, and the MIDDLE click: a card
    /// is a link, and the middle button opens one in a new tab app-wide.
    onOpen,
    /// `(event, entry) => void` — the right button over the card. The panel
    /// belongs to the screen (one `ContextMenu` per panel, at the pointer);
    /// the card only reports. Null leaves the right button alone.
    onContextMenu = null,
    /// Whether this notebook draws banners at all (App Functions). Defaults
    /// to on, like every other switch a component is not told about.
    banners = true,
    /// Whether the card draws the note's tags (App Functions, `noteTags`).
    noteTags = true,
    /// The colour of the space the card is in (a name) — what its tags wear.
    tagColor = null,
    /// Whether the card says when the note was last opened (the time axis,
    /// `Native Functions › Time`). The stamp itself comes with the entry.
    showAge = true,
    /// How a date is drawn once the stamp stops being a number of days.
    dateFormat = "mm/dd/yyyy",
  } = $props();

  /// Only the middle button, and never while picking: in that mode a click is
  /// choosing, not going, and a second gesture that navigates would be a way
  /// out of the mode nobody asked for.
  function middleOpen(event) {
    if (event.button !== 1 || picking) return;
    event.preventDefault();
    onOpen?.(entry, { newTab: true });
  }

  /// A banner the notebook does not draw is not drawn here either: the card
  /// without one is title and preview.
  let banner = $derived(banners ? (entry.banner ?? null) : null);
  let isImage = $derived(banner?.kind === "image");
  let src = $derived(isImage ? assetUrl(root, banner.value) : "");
  let tint = $derived(banner?.kind === "color" ? accentFill(banner.value) : null);

  /// A note nobody has named carries the app's own "New note", and a column
  /// of those says nothing: the card draws its text instead. The small card
  /// inside a folder keeps it — the title is all it has.
  let titled = $derived(small || !isUntitled(entry.title));

  // A note is old when nobody has OPENED it in a while, not when nobody has
  // written it. The core stamps the entry; the card only says whether the
  // number is a reading or a birth (the eye and the clock).
  let since = $derived(noteSince(entry));
  let age = $derived(
    showAge && !small
      ? ageStamp(entry.age, {
          since,
          dateFormat,
          title: entry.seen ? S.lastSeenOn : S.createdOn,
        })
      : null,
  );
</script>

<article
  class="note-card"
  class:note-card--small={small}
  class:note-card--bare={!titled && !banner}
  class:note-card--picked={selected}
  class:note-card--pinned={entry.pinned}
  oncontextmenu={onContextMenu && !picking
    ? (event) => onContextMenu(event, entry)
    : null}
>
  <button
    class="note-card__open"
    aria-pressed={picking ? selected : undefined}
    onclick={() => onOpen?.(entry)}
    onauxclick={middleOpen}
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
            <!-- The address points at a picture that is gone (deleted, or the
                 notebook travelled without it): a placeholder, not a collapse. -->
            <span class="note-card__missing" title={S.missingImage}>
              <Icon name="image" size="1.5rem" />
            </span>
          {/if}
        {/if}
      </span>
    {/if}

    {#if titled}
      <span class="note-card__title" class:note-card__title--chip={banner && !small}>
        {#if entry.pinned && !small}
          <!-- On a phone the pin BUTTON is not drawn (the corner is the ⋮'s,
               note-card.css), so the filled mark sits at the head of the title
               instead. Nothing on a desktop, which keeps the button. -->
          <span class="note-card__pinned" title={S.unpin}>
            <Icon name="bookmark-simple-fill" size="0.75rem" />
          </span>
        {/if}
        {entry.title}
      </span>
    {/if}

    {#if !small}
      <NotePreview markdown={entry.preview} empty={S.emptyNote} />
      <!-- The card's quiet last line: what the note is about on the left,
           when it was last opened on the right. One row, so a card with
           neither does not grow a strip of empty space. -->
      {#if (noteTags && entry.tags?.length) || age}
        <span class="note-card__meta">
          {#if noteTags && entry.tags?.length}
            <span class="note-card__tags">
              {#each entry.tags as tag (tag)}<Badge label={`#${tag}`} color={tagColor} />{/each}
            </span>
          {/if}
          {#if age}
            <span
              class="note-card__age"
              class:note-card__age--forgotten={age.band === "forgotten"}
              title={age.title ?? S.neverOpened}
            >
              <Icon name={entry.seen ? "eye" : "clock"} size="0.75rem" />
              {age.text}
            </span>
          {/if}
        </span>
      {/if}
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
