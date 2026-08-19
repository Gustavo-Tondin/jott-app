<script>
  // Choosing a file from the notebook's library — for a note's banner, for
  // putting an image in a note's body, and for attaching a file to a task.
  //
  // It is the same library the Images screen shows (screens/AssetsView.svelte)
  // and the same import; what differs is the question being asked. Here the
  // answer is an ADDRESS and the dialog closes; there, the library is the
  // screen and nothing is picked. Sharing the loading and the writing
  // (services/assets.js) rather than the markup is what keeps the two from
  // drifting where it matters.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { assetUrl, importFiles, isImage } from "../services/assets.js";
  import { filesFromInput } from "../services/gesture.js";
  import Modal from "./Modal.svelte";
  import Icon from "./Icon.svelte";

  let {
    /// The notebook's root, absolute — what an address is resolved against.
    root = null,
    /// `(address) => void`
    onPick,
    onClose,
    onError,
    readOnly = false,
    /// Whether the question is "which PICTURE?" — a banner and an image inside
    /// a note can only be something the app draws, so the library is filtered
    /// and the file input asks the OS for images. A task attachment asks for
    /// any file, and gets the whole library (2026-08-18).
    imagesOnly = false,
  } = $props();

  let assets = $state([]);
  let busy = $state(false);
  let input = $state(null);

  let shown = $derived(imagesOnly ? assets.filter((asset) => asset.image) : assets);

  $effect(() => {
    load();
  });

  async function load() {
    try {
      assets = (await api.assets()) ?? [];
    } catch (e) {
      onError?.(e);
    }
  }

  async function add(event) {
    const files = filesFromInput(event.currentTarget);
    if (!files.length) return;
    busy = true;
    try {
      const added = await importFiles(files);
      await load();
      // Importing one file in order to use it is the whole gesture: making the
      // user then find it in the grid would be asking twice. Unless a PICTURE
      // was asked for and that is not one — then the grid is where it lands,
      // and the question is still open.
      const one = added.length === 1 ? added[0] : null;
      if (one && (!imagesOnly || isImage(one))) onPick?.(one);
    } catch (e) {
      onError?.(e);
    } finally {
      busy = false;
    }
  }
</script>

<Modal
  label={imagesOnly ? S.chooseImage : S.chooseFile}
  wide
  backdropClass="asset-picker__backdrop"
  panelClass="asset-picker"
  {onClose}
>
  <header class="asset-picker__head">
    <h2 class="theme-title theme-title--sm">{imagesOnly ? S.chooseImage : S.chooseFile}</h2>
    {#if !readOnly}
      <button
        class="theme-btn theme-btn--sm theme-btn--primary"
        disabled={busy}
        onclick={() => input?.click()}
      >
        {busy ? S.addingImages : S.addImages}
      </button>
      <!-- A file input, not the system dialog plugin: this is the one door
           that works the same on the desktop and on a phone, where picking a
           file goes through the OS picker the webview already talks to. -->
      <input
        class="asset-picker__input"
        type="file"
        accept={imagesOnly ? "image/*" : undefined}
        multiple
        bind:this={input}
        onchange={add}
      />
    {/if}
    <button class="theme-btn--icon" aria-label={S.cancel} title={S.cancel} onclick={onClose}>
      <Icon name="x" size="1rem" />
    </button>
  </header>

  {#if shown.length === 0}
    <p class="asset-picker__empty">
      {S.assetsEmpty}{#if imagesOnly}&nbsp;{S.chooseImageOnly}{/if}
    </p>
  {:else}
    <ul class="asset-picker__grid">
      {#each shown as asset (asset.path)}
        <li>
          <button
            class="asset-picker__item"
            title={asset.name}
            onclick={() => onPick?.(asset.path)}
          >
            {#if asset.image}
              <img class="asset-picker__thumb" src={assetUrl(root, asset.path)} alt="" />
            {:else}
              <!-- Not something the app draws: the file says what it is with
                   its name and a glyph, which is all an attachment needs. -->
              <span class="asset-picker__thumb asset-picker__thumb--file">
                <Icon name="paperclip" size="1.25rem" />
              </span>
            {/if}
            <span class="asset-picker__name">{asset.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Modal>
