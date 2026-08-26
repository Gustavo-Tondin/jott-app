<script>
  // The head of an open note: its banner, and its title.
  //
  // Wireframes: "Editor screen - maximized" (desktop) and "Editor Screen
  // mobile". A banner is a wide block of colour or a picture with the note's
  // title sitting on a chip inside it, and a ⋮ in its top right.
  //
  // **The title is drawn either way** (user call, 2026-08-19: "caso não tenha
  // escolhido nada, a altura e o fundo do banner somem e o título continua ali
  // na mesma posição"). So this is not "a banner, or a heading instead": it is
  // one head whose block has a colour and a height only when the note asks for
  // one. That is why the title lives in the same box in both cases and why the
  // ⋮ is here in both cases — a note with no banner is exactly where one is
  // chosen from.
  //
  // The banner itself is one line of the note's own file (`<!--banner: …-->`,
  // see `core/src/note.rs`), so what this component edits is the document, not
  // a setting: it reads as part of the note in any other markdown editor, and
  // it travels with the file.
  import { S } from "../services/strings.js";
  import { accentFill, badgeStyle } from "../services/accent.js";
  import { formatDate } from "../services/dates.js";
  import Badge from "./Badge.svelte";
  import TagPicker from "./TagPicker.svelte";
  import { assetUrl } from "../services/assets.js";
  import { dismissable } from "../actions/dismissable.js";
  import { keepOnScreen } from "../actions/keepOnScreen.js";
  import AccentPicker from "./AccentPicker.svelte";
  import Icon from "./Icon.svelte";

  let {
    /// `{ kind: "color" | "image", value }`, or null for a note without one.
    banner = null,
    title = "",
    /// The notebook's root — an image banner is an address, resolved against it.
    root = null,
    readOnly = false,
    /// The narrow shell (shell/compact.js). The block goes flush with the
    /// three edges of the screen there, as the mobile wireframe draws it.
    compact = false,
    /// `(value) => void` — a colour name, an asset address, or null to take
    /// the banner off. The one channel: which of the two a value IS is decided
    /// in the core, not here.
    onSet,
    /// Asks the shell to open the image picker; it calls `onSet` with what
    /// comes back.
    onChooseImage,
    /// Renaming, from the title itself. Below 768px the bar above the page no
    /// longer prints the note's name — this IS the name of the note on screen
    /// (wireframe "New note mobile - no banner") — so the door to renaming has
    /// to be here as well as in the page ⋮.
    onRename = null,
    /// The note's PROPERTIES, drawn as a line under the title the way
    /// Obsidian draws them (2026-08-26): when it was created, and its tags
    /// — its subjects, picked from the same catalogue a task's tags come
    /// from. `tags` is what the note has, `catalogue` what the picker offers.
    created = null,
    tags = [],
    catalogue = [],
    dateFormat = "mm/dd/yyyy",
    /// `(tags) => void` — the whole list, replaced. Null: nothing is editable.
    onSetTags = null,
    /// `(name) => void` — a tag typed into the picker that the catalogue does
    /// not have yet; the shell saves it and applies it.
    onCreateTag = null,
    /// Whether this notebook shows note tags at all (App Functions). Off, the
    /// properties line is not drawn — the `tags:` stays in the file.
    tagsEnabled = true,
    /// The colour of the note's space (a name) — what its tags wear.
    color = null,
    /// Whether this notebook has banners at all (App Functions, 2026-08-20).
    /// Off, the head is the TITLE and nothing else — no band, no ⋮ to hang one
    /// with — and the `<!--banner:-->` line already in a file stays exactly
    /// where it is, the way a task keeps its `!2` while priority is off.
    enabled = true,
  } = $props();

  let open = $state(false);

  /// Nothing is drawn from a banner the notebook does not draw. Folded in
  /// here, once, rather than at each of the four places that read it.
  let shown = $derived(enabled ? banner : null);
  let isImage = $derived(shown?.kind === "image");
  let src = $derived(isImage ? assetUrl(root, shown.value) : "");
  /// A colour banner paints with the palette; a hex written by hand passes
  /// through, the same tolerance every other colour in the app keeps.
  let tint = $derived(shown?.kind === "color" ? accentFill(shown.value) : null);

  const set = (value) => {
    open = false;
    onSet?.(value);
  };

  let editsTags = $derived(tagsEnabled && !readOnly && !!onSetTags);
  /// The line is drawn when there is something on it: a date, a tag, or the
  /// door to adding one.
  let showsProps = $derived(tagsEnabled && (!!created || tags.length > 0 || editsTags));
  const addTag = (name) => {
    if (!tags.includes(name)) onSetTags?.([...tags, name]);
  };
  const removeTag = (name) => onSetTags?.(tags.filter((t) => t !== name));
</script>

<div
  class="note-banner"
  class:note-banner--empty={!shown}
  class:note-banner--image={isImage}
  class:note-banner--compact={compact}
  style={tint ? `--banner: ${tint}` : ""}
>
  {#if isImage}
    <!-- Alt is empty on purpose: the banner is decoration above a note whose
         title is read out right below it. -->
    <img class="note-banner__image" src={src} alt="" />
  {/if}

  {#if !readOnly && enabled}
    <div
      class="note-banner__menu"
      class:note-banner__menu--open={open}
      use:dismissable={{ active: open, onDismiss: () => (open = false) }}
    >
      <button
        class="theme-btn--icon note-banner__more"
        class:note-banner__more--on-block={!!shown}
        aria-label={S.bannerOptions}
        title={S.bannerOptions}
        onclick={() => (open = !open)}
      >
        <Icon name="dots-three" size="1rem" />
      </button>
      {#if open}
        <div class="theme-popover theme-popover--end note-banner__panel" use:keepOnScreen>
          <AccentPicker
            value={shown?.kind === "color" ? shown.value : null}
            preview="fill"
            clearable={false}
            label={S.bannerColor}
            onPick={(name) => set(name)}
          />
          <button class="note-banner__action" onclick={() => { open = false; onChooseImage?.(); }}>
            {S.bannerImage}
          </button>
          {#if shown}
            <button class="note-banner__action" onclick={() => set(null)}>
              {S.removeBanner}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- The title, in a box as wide as the note's own text: the chip's first
       letter lands over the first letter of the first paragraph, which is what
       the wireframe draws (a 720px column inside a 900px block). -->
  <div class="note-banner__line">
    <h1 class="note-banner__title">
      {#if onRename}
        <button
          class="note-banner__rename"
          title={S.promptRenameNote(title)}
          onclick={() => onRename()}
        >
          {title}
        </button>
      {:else}
        {title}
      {/if}
    </h1>
    {#if showsProps}
      <dl class="note-banner__props">
        {#if created}
          <div class="note-banner__prop">
            <dt class="note-banner__prop-name">
              <Icon name="calendar-blank" size="0.875rem" />
              <span>{S.noteCreated}</span>
            </dt>
            <dd class="note-banner__prop-value">{formatDate(created, dateFormat)}</dd>
          </div>
        {/if}
        <div class="note-banner__prop">
          <dt class="note-banner__prop-name">
            <Icon name="tag" size="0.875rem" />
            <span>{S.noteTags}</span>
          </dt>
          <dd class="note-banner__prop-value note-banner__tags">
            {#each tags as tag (tag)}
              <span class="theme-badge note-banner__tag" style={badgeStyle(color)}>
                #{tag}
                {#if editsTags}
                  <button
                    class="note-banner__tag-remove"
                    onclick={() => removeTag(tag)}
                    aria-label={S.removeTag(tag)}
                  >
                    <Icon name="x" size="0.625rem" />
                  </button>
                {/if}
              </span>
            {/each}
            {#if editsTags}
              <TagPicker
                tags={catalogue}
                applied={tags}
                onPick={addTag}
                onCreate={(name) => (onCreateTag ? onCreateTag(name) : addTag(name))}
              />
            {/if}
          </dd>
        </div>
      </dl>
    {/if}
  </div>
</div>
