<script>
  // The head of an open note: its banner, and its title.
  //
  // Wireframes: "Editor screen - maximized" (desktop) and "Editor Screen
  // mobile". A banner is a wide block of colour or a picture, with the note's
  // title sitting on a chip that overlaps its bottom edge and a ⋮ in its top
  // right. Without a banner there is no block — the note "fica só com título"
  // (user, 2026-08-18), which is the plain heading this draws instead.
  //
  // The banner itself is one line of the note's own file (`<!--banner: …-->`,
  // see `core/src/note.rs`), so what this component edits is the document, not
  // a setting: it reads as part of the note in any other markdown editor, and
  // it travels with the file.
  import { S } from "../services/strings.js";
  import { accentFill } from "../services/accent.js";
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
    /// The narrow shell (shell/compact.js). There the bar above the page
    /// already prints the note's name in full, so a note with NO banner draws
    /// no title of its own — the same rule the space screens follow, and the
    /// same report that produced it ("o nome dito duas vezes", 2026-08-18). A
    /// note WITH a banner still carries it on the chip: that is the wireframe,
    /// and the chip is part of the block, not a second heading.
    compact = false,
    /// `(value) => void` — a colour name, an asset address, or null to take
    /// the banner off. The one channel: which of the two a value IS is decided
    /// in the core, not here.
    onSet,
    /// Asks the shell to open the image picker; it calls `onSet` with what
    /// comes back.
    onChooseImage,
  } = $props();

  let open = $state(false);

  let isImage = $derived(banner?.kind === "image");
  let src = $derived(isImage ? assetUrl(root, banner.value) : "");
  /// A colour banner paints with the palette; a hex written by hand passes
  /// through, the same tolerance every other colour in the app keeps.
  let tint = $derived(banner?.kind === "color" ? accentFill(banner.value) : null);

  const set = (value) => {
    open = false;
    onSet?.(value);
  };
</script>

{#if banner}
  <div
    class="note-banner"
    class:note-banner--image={isImage}
    style={tint ? `--banner: ${tint}` : ""}
  >
    {#if isImage}
      <!-- Alt is empty on purpose: the banner is decoration above a note whose
           title is read out right below it. -->
      <img class="note-banner__image" src={src} alt="" />
    {/if}

    {#if !readOnly}
      <div class="note-banner__menu" use:dismissable={{ active: open, onDismiss: () => (open = false) }}>
        <button
          class="theme-btn--icon note-banner__more"
          aria-label={S.bannerOptions}
          title={S.bannerOptions}
          onclick={() => (open = !open)}
        >
          <Icon name="dots-three" size="1rem" />
        </button>
        {#if open}
          <div class="theme-popover theme-popover--end note-banner__panel" use:keepOnScreen>
            <AccentPicker
              value={banner.kind === "color" ? banner.value : null}
              clearable={false}
              label={S.bannerColor}
              onPick={(name) => set(name)}
            />
            <button class="note-banner__action" onclick={() => { open = false; onChooseImage?.(); }}>
              {S.bannerImage}
            </button>
            <button class="note-banner__action" onclick={() => set(null)}>
              {S.removeBanner}
            </button>
          </div>
        {/if}
      </div>
    {/if}

    <h1 class="note-banner__title">{title}</h1>
  </div>
{:else if !compact}
  <h1 class="theme-title note-banner__plain">{title}</h1>
{/if}
