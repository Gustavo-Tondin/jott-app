<script>
  // One note on the board (wireframes "Notes screen - default", "Space Notes",
  // "Notes Screen - mobile").
  //
  // A card is its banner, its title on a chip over the banner's bottom edge,
  // and the first lines of its text — DRAWN as the markdown they are
  // (components/NotePreview.svelte), which is what makes a card look like a
  // small picture of the note instead of a paragraph of syntax. A note with no
  // banner is the same card without the coloured block — the title reads as a
  // title on its own, which is what "sem banner a nota fica só com título"
  // means on the board too.
  //
  // The card only ever DRAWS. Opening, picking, pinning and the ⋮'s items are
  // the board's business (spaces/NotesSpace.svelte), because they are the same
  // gestures whether the card sits on a board or inside a folder card. The two
  // gestures a card answers on its own — the middle button and the right one —
  // are reported the same way: it says WHICH card was asked for, never what
  // happens next.
  import { S } from "../services/strings.js";
  import { accentFill } from "../services/accent.js";
  import { assetUrl } from "../services/assets.js";
  import { ageStamp, noteSince } from "../services/age.js";
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
    /// `() => void` — pinning, beside the ⋮ (user call, 2026-08-19: "com a
    /// mesma funcionalidade das tarefas"). It is a button of its own and not
    /// only a menu item because a pin is a STATE: the card has to say whether
    /// it is pinned without being asked, and the drawn pin is what says it.
    /// Null draws none.
    onPin = null,
    /// `(entry, {newTab}) => void` — the click, and the MIDDLE click: a card
    /// is a link to a document, and the middle button opens a link in a new
    /// tab everywhere else in this app (shell/Sidebar.svelte) as well as
    /// outside it.
    onOpen,
    /// `(event, entry) => void` — the right button over the card. The panel
    /// itself belongs to the screen (the same pact the sidebar keeps: one
    /// `ContextMenu` per panel, at the pointer), so the card only reports the
    /// gesture. Null leaves the right button alone.
    onContextMenu = null,
    /// Whether this notebook draws banners at all (App Functions, 2026-08-20).
    /// Defaults to on, like every other switch a component is not told about.
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

  /// A banner the notebook does not draw is not drawn here either (App
  /// Functions, 2026-08-20) — and the card without one is the card this
  /// component was already written for: title and preview.
  let banner = $derived(banners ? (entry.banner ?? null) : null);
  let isImage = $derived(banner?.kind === "image");
  let src = $derived(isImage ? assetUrl(root, banner.value) : "");
  let tint = $derived(banner?.kind === "color" ? accentFill(banner.value) : null);

  // The other half of the time axis: a note is old when nobody has OPENED it
  // in a while, not when nobody has written it (spec 3.6b). The core stamps
  // the entry; the card only says whether the number it is showing is a
  // reading or a birth, which is what the eye and the clock are for.
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
