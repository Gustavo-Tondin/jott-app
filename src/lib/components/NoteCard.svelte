<script>
  // One note on the board: its banner, its name, the first lines DRAWN as
  // markdown (NotePreview), and a foot that says where it came from and how
  // old it is. A note with no banner is the same card without the block. The card only ever
  // DRAWS: opening, picking, pinning and the ⋮'s items are the board's; the
  // middle and right buttons only report WHICH card was asked for.
  import { S } from "../services/strings.js";
  import { accentFill, dotStyle } from "../services/accent.js";
  import { leafOf } from "../services/paths.js";
  import { assetUrl } from "../services/assets.js";
  import { ageStamp, noteSince } from "../services/age.js";
  import { isUntitled } from "../services/noteTitle.js";
  import Menu from "./Menu.svelte";
  import Icon from "./Icon.svelte";
  import NotePreview from "./NotePreview.svelte";

  let {
    /// A `NoteEntry` from the bridge.
    entry,
    /// The notebook's root, for an image banner's URL.
    root = null,
    /// Picking mode: a click chooses the card instead of opening it, and the
    /// chosen ones are tinted (the same pact the task cards keep).
    picking = false,
    selected = false,
    /// `(event, entry) => void` — the ⋮ where a card has a RING: the same
    /// actions the hold opens, opened by a click and pressed rather than
    /// travelled to (services/actionRing.js). Null leaves the ⋮ to `menu`.
    onOptions = null,
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
    /// Whether the card says when the note was last opened (the time axis,
    /// `Native Functions › Time`). The stamp itself comes with the entry.
    showAge = true,
    /// How a date is drawn once the stamp stops being a number of days.
    dateFormat = "mm/dd/yyyy",
    /// `{label, color}` or null — where the note came from, on a screen that
    /// shows more than one space (the Home's day): a dot in the space's
    /// colour and its name, at the card's foot (services/origin.js).
    origin = null,
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
  class="note-card theme-press"
  class:note-card--small={small}
  class:note-card--bare={!titled}
  class:note-card--banner={!!banner && !small}
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

    <span class="note-card__body">
      {#if titled}<span class="note-card__title">{entry.title}</span>{/if}
      {#if !small}
        <NotePreview
          markdown={entry.preview}
          title={titled ? entry.title : null}
          empty={S.emptyNote}
          lang={entry.lang}
        />
      {/if}
    </span>

    <!-- The card's foot: where the note came from on the left, how long since
         it was opened on the right. One row, and none when there is neither. -->
    {#if !small && (origin || age)}
      <span class="note-card__meta">
        {#if origin}
          <span class="note-card__origin" title={origin.label}>
            <span class="theme-dot note-card__dot" style={dotStyle(origin.color)} aria-hidden="true"
            ></span>{leafOf(origin.label)}
          </span>
        {/if}
        {#if age}
          <span
            class="note-card__age"
            class:note-card__age--forgotten={age.band === "forgotten"}
            title={age.title ?? S.neverOpened}
          >
            {age.text}
          </span>
        {/if}
      </span>
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
      {#if onOptions}
        <button
          class="theme-btn--icon note-card__more"
          onclick={(event) => onOptions(event, entry)}
          aria-label={S.noteOptions}
          title={S.noteOptions}
        >
          <Icon name="dots-three-vertical-bold" size="0.875rem" />
        </button>
      {:else if menu.length > 0}
        <Menu items={menu} align="end">
          {#snippet trigger({ toggle })}
            <button
              class="theme-btn--icon note-card__more"
              onclick={toggle}
              aria-label={S.noteOptions}
              title={S.noteOptions}
            >
              <Icon name="dots-three-vertical-bold" size="0.875rem" />
            </button>
          {/snippet}
        </Menu>
      {/if}
    </div>
  {/if}
</article>
