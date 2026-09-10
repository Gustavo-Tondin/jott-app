<script>
  // The head of an open note: its banner and its title. One head whose block
  // has colour and height only when the note asks for it; the TITLE opens one
  // popover with its name and the banner. The properties go BELOW the block,
  // never on it: no ink colour holds against every picture. The banner is a
  // line of the note's own file (`<!--banner: …-->`, core/src/note.rs).
  import { S } from "../services/strings.js";
  import { accentFill, badgeStyle } from "../services/accent.js";
  import { formatDate } from "../services/dates.js";
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
    /// The narrow shell (shell/compact.js): the block goes flush with the
    /// three edges of the screen.
    compact = false,
    /// `(value) => void` — a colour name, an asset address, or null to take
    /// the banner off. The one channel: which of the two a value IS is decided
    /// in the core, not here.
    onSet,
    /// Asks the shell to open the image picker; it calls `onSet` with what
    /// comes back.
    onChooseImage,
    /// `(name) => void` — the name typed in the title's popover. Null: the
    /// popover has no name field.
    onRename = null,
    /// The note's PROPERTIES, a line under the title: when it was created and
    /// its tags. `tags` is what the note has, `catalogue` what the picker offers.
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
    /// Whether this notebook has banners at all (App Functions). Off, the head
    /// is the TITLE alone — no band, no banner rows — and a `<!--banner:-->`
    /// line already in the file stays where it is.
    enabled = true,
  } = $props();

  let open = $state(false);
  let draft = $state("");
  let field = $state(null);

  /// Nothing is drawn from a banner the notebook does not draw. Folded in
  /// here, once, rather than at each of the four places that read it.
  let shown = $derived(enabled ? banner : null);
  let isImage = $derived(shown?.kind === "image");
  let src = $derived(isImage ? assetUrl(root, shown.value) : "");
  /// A colour banner paints with the palette; a hex written by hand passes
  /// through, the same tolerance every other colour in the app keeps.
  let tint = $derived(shown?.kind === "color" ? accentFill(shown.value) : null);

  /// The title is a door only where there is something behind it.
  let editable = $derived(!readOnly && (!!onRename || enabled));

  function toggle() {
    if (open) return close();
    draft = title;
    open = true;
    // On a phone the field would raise the keyboard over the colours nobody
    // asked to type into; there it waits for a tap.
    if (!compact) queueMicrotask(() => field?.select());
  }

  /// Leaving the popover keeps what was typed, like every field of the app;
  /// Escape is the way out without it (see `forget`).
  function close() {
    if (!open) return;
    open = false;
    const next = draft.trim();
    if (onRename && next && next !== title) onRename(next);
  }

  /// `dismissable` answers Escape in the DOCUMENT's capture phase and closes
  /// through `close`, so the typing is dropped a step earlier — the window's.
  function forget(event) {
    if (open && event.key === "Escape") draft = title;
  }

  function chooseImage() {
    close();
    onChooseImage?.();
  }

  let editsTags = $derived(tagsEnabled && !readOnly && !!onSetTags);
  /// The line is drawn when there is something on it: a date, a tag, or the
  /// door to adding one.
  let showsProps = $derived(tagsEnabled && (!!created || tags.length > 0 || editsTags));
  const addTag = (name) => {
    if (!tags.includes(name)) onSetTags?.([...tags, name]);
  };
  const removeTag = (name) => onSetTags?.(tags.filter((t) => t !== name));
</script>

<svelte:window onkeydowncapture={forget} />

<div
  class="note-banner"
  class:note-banner--empty={!shown}
  class:note-banner--image={isImage}
  class:note-banner--compact={compact}
  style={tint ? `--banner: ${tint}` : ""}
>
  <!-- The block: the colour or the picture, and the title standing on it.
       Everything with a background lives in here, so what is outside it is on
       the canvas's own ground. -->
  <div class="note-banner__block">
    {#if isImage}
      <!-- Alt is empty on purpose: the banner is decoration above a note whose
           title is read out right below it. -->
      <img class="note-banner__image" src={src} alt="" />
    {/if}

    <!-- The title, in a box as wide as the note's own text: the chip's first
         letter lands over the first letter of the first paragraph. -->
    <div class="note-banner__line">
      <!-- What the popover hangs from (`keepOnScreen` anchors to the parent):
           as wide as the title, not as the line. -->
      <div
        class="note-banner__head"
        use:dismissable={{ active: open, onDismiss: close }}
      >
        <h1 class="note-banner__title">
          {#if editable}
            <!-- No `title`: its tooltip would land on the name field below. -->
            <button
              class="note-banner__rename"
              aria-haspopup="dialog"
              aria-expanded={open}
              onclick={toggle}
            >
              {title}
            </button>
          {:else}
            {title}
          {/if}
        </h1>

        {#if open}
          <div
            class="theme-popover theme-popover--start note-banner__panel"
            role="dialog"
            aria-label={S.noteHead}
            use:keepOnScreen
          >
            {#if onRename}
              <form onsubmit={(e) => (e.preventDefault(), close())}>
                <input
                  bind:this={field}
                  class="theme-input note-banner__name"
                  aria-label={S.noteTitleField}
                  bind:value={draft}
                />
              </form>
            {/if}
            {#if enabled}
              {#if onRename}
                <span class="note-banner__rule" role="separator"></span>
              {/if}
              <span class="note-banner__panel-label">{S.banner}</span>
              <AccentPicker
                value={shown?.kind === "color" ? shown.value : null}
                preview="fill"
                clearable={false}
                label={S.bannerColor}
                onPick={(name) => onSet?.(name)}
              />
              <button class="note-banner__action" onclick={chooseImage}>
                {S.bannerImage}
              </button>
              {#if shown}
                <button class="note-banner__action" onclick={() => onSet?.(null)}>
                  {S.removeBanner}
                </button>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- The properties, on the canvas and not on the block — same column as the
       title, so the two line up with or without a banner. -->
  {#if showsProps}
    <div class="note-banner__line note-banner__line--props">
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
    </div>
  {/if}
</div>
