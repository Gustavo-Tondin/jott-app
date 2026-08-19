<script>
  // Files — the notebook's library, opened from the sidebar's hamburger,
  // beside Completed, Tags and the Trash.
  //
  // Everything the app points at from a document comes from here: a note's
  // banner (`<!--banner: assets/x.png-->`), a file inside one
  // (`[[/x.png]]`, services/embeds.js) and a task's attachment
  // (`[nota.pdf](assets/nota.pdf)`) all name a file of this folder. The address
  // is relative to the notebook's root, so it is the same address from every
  // note and every task — which is why this is one library and not a folder
  // per space.
  //
  // ANY file lives here; only an image is drawn (2026-08-18). A thumbnail for
  // what the app can show, a glyph for what it cannot.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import {
    assetUrl,
    carriesFiles,
    importBrought,
    importFiles,
    readGesture,
    readPaste,
  } from "../services/assets.js";
  import { referenceName } from "../services/embeds.js";
  import Icon from "../components/Icon.svelte";

  let {
    /// The notebook's root, absolute — what an address resolves against.
    root = null,
    readOnly = false,
    onChanged,
    onError,
    /// `(path, folder) => void` and `(list, id) => void` — the way to what
    /// uses a file. The same two doors the search box opens its hits with, so
    /// there is one answer to "open this hit" in the app (2026-08-19).
    onOpenNote,
    onOpenTask,
    reloadKey = 0,
  } = $props();

  let assets = $state([]);
  /// Where each file is used, keyed by address. A file nobody points at has
  /// no entry — that IS the "not used" answer, and it costs nothing to carry.
  let usage = $state({});
  /// Which file's places are open. One at a time: the list is a detail of the
  /// row that asked for it, not a column of the grid.
  let showing = $state(null);
  let busy = $state(false);
  let copied = $state(null);
  let input = $state(null);
  /// Whether a file is being held over the screen — the only way the person
  /// knows this place will take it.
  let dragging = $state(false);

  $effect(() => {
    reloadKey;
    load();
  });

  async function load() {
    try {
      assets = (await api.assets()) ?? [];
      // A second question, asked after: the grid is worth drawing even if the
      // notebook is too big for the scan to have finished, and a file whose
      // usage is not known yet reads as "not used" for a moment rather than
      // as nothing at all.
      usage = (await api.assetUsage()) ?? {};
    } catch (e) {
      onError?.(e);
    }
  }

  const placesFor = (asset) => usage[asset.path] ?? [];

  /// Goes to whatever uses the file. A note is opened at its address, a task
  /// in the list that holds it — the two doors the search box already uses.
  function go(place) {
    showing = null;
    if (place.kind === "note") onOpenNote?.(place.path, place.folder);
    else onOpenTask?.(place.path, place.id);
  }

  async function add(event) {
    // Copied out before the reset — see the same handler in AssetPicker: in
    // WebKit, clearing the input empties the `FileList` object already in
    // hand, and the import would quietly import nothing.
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!files.length) return;
    busy = true;
    try {
      await importFiles(files);
      await load();
      // The sidebar counts nothing here, but the open note may be showing one
      // of these — a reload is what redraws it.
      onChanged?.();
    } catch (e) {
      onError?.(e);
    } finally {
      busy = false;
    }
  }

  // Dropping a file ON the library, and pasting one into it (user call,
  // 2026-08-19). The same door the note has, asking the same question — this
  // screen is what the library IS, so it is the most obvious place in the app
  // to hand a file to, and it was the one place that did not accept one.
  function catches(transfer, read) {
    if (readOnly) return false;
    if (!transfer?.files?.length && !carriesFiles(transfer)) return false;
    take(read(transfer));
    return true;
  }

  async function take(reading) {
    busy = true;
    try {
      const brought = await reading;
      if (!brought.files.length && !brought.paths.length) {
        onError?.(S.noFileInGesture(brought.types ?? []));
        return;
      }
      await importBrought(brought);
      await load();
      onChanged?.();
    } catch (e) {
      onError?.(e);
    } finally {
      busy = false;
    }
  }

  async function remove(asset) {
    if (!confirm(S.confirmDeleteAsset(asset.name))) return;
    try {
      await api.deleteAsset(asset.path);
      await load();
      onChanged?.();
    } catch (e) {
      onError?.(e);
    }
  }

  /// What a note calls the file — `/foto.jpg`, the piece that goes between a
  /// pair of brackets (user call, 2026-08-19). Not the machine path, which
  /// would break the moment the notebook moved to another computer; and not
  /// `assets/foto.jpg`, which is where the file LIVES and not how it is
  /// named.
  async function copy(asset) {
    try {
      await navigator.clipboard.writeText(referenceName(asset.path));
      copied = asset.path;
      setTimeout(() => (copied = copied === asset.path ? null : copied), 1500);
    } catch (e) {
      onError?.(e);
    }
  }

  const kb = (size) => Math.max(1, Math.round(size / 1024));

  /// Hands the file to whatever the system opens that kind with. The app has
  /// no viewer of its own, and it is not the app's file to keep inside.
  const open = (asset) => api.openAsset(asset.path).catch((e) => onError?.(e));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="assets-view"
  class:assets-view--taking={dragging}
  onpastecapture={(e) => catches(e.clipboardData, readPaste) && e.preventDefault()}
  ondropcapture={(e) => {
    dragging = false;
    return catches(e.dataTransfer, readGesture) && e.preventDefault();
  }}
  ondragovercapture={(e) => {
    if (readOnly || !carriesFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={(e) => {
    // Only when the pointer left the screen itself, not when it crossed from
    // one card to the next.
    if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) dragging = false;
  }}
>
  <header class="assets-view__head">
    <h2 class="theme-title assets-view__title">{S.assetsTitle}</h2>
    {#if !readOnly}
      <button
        class="theme-btn theme-btn--primary theme-btn--sm"
        disabled={busy}
        onclick={() => input?.click()}
      >
        {busy ? S.addingImages : S.addImages}
      </button>
      <!-- No `accept`: the library holds whatever a task attaches, and only
           the banner and a note's picture ask for an image (AssetPicker). -->
      <input
        class="assets-view__input"
        type="file"
        multiple
        bind:this={input}
        onchange={add}
      />
    {/if}
  </header>
  <p class="assets-view__hint">{S.assetsHint}</p>

  {#if assets.length === 0}
    <p class="assets-view__empty">{S.assetsEmpty}</p>
  {:else}
    <p class="assets-view__count">{S.imageCount(assets.length)}</p>
    <ul class="assets-view__grid">
      {#each assets as asset (asset.path)}
        <li class="assets-view__item">
          <button
            class="assets-view__frame"
            onclick={() => open(asset)}
            title={S.openFile}
            aria-label={`${S.openFile}: ${asset.name}`}
          >
            {#if asset.image}
              <img class="assets-view__thumb" src={assetUrl(root, asset.path)} alt="" />
            {:else}
              <span class="assets-view__glyph">
                <Icon name="paperclip" size="1.5rem" />
              </span>
            {/if}
          </button>
          <span class="assets-view__name" title={asset.name}>{asset.name}</span>
          <span class="assets-view__meta">{S.imageSize(kb(asset.size))}</span>
          <!-- Whether anything points at this file, said right above the
               button that deletes it: "not used" is the one fact that makes
               deleting safe, and it is the fact the screen was missing. -->
          {#if placesFor(asset).length === 0}
            <span class="assets-view__unused">{S.assetUnused}</span>
          {:else}
            <button
              class="assets-view__used"
              aria-expanded={showing === asset.path}
              onclick={() => (showing = showing === asset.path ? null : asset.path)}
            >
              {S.assetUsedIn(placesFor(asset).length)}
            </button>
            {#if showing === asset.path}
              <ul class="assets-view__places">
                {#each placesFor(asset) as place, i (`${place.kind}:${place.path}:${place.id ?? i}`)}
                  <li>
                    <button
                      class="assets-view__place"
                      onclick={() => go(place)}
                      title={S.assetGoTo(place.title)}
                    >
                      <Icon
                        name={place.kind === "note" ? "notepad" : "list-checks"}
                        size="0.875rem"
                      />
                      <span class="assets-view__place-name">{place.title}</span>
                      <span class="assets-view__place-where">{place.space}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
          <span class="assets-view__actions">
            <button
              class="assets-view__action"
              onclick={() => copy(asset)}
              title={S.copyAddress}
              aria-label={S.copyAddress}
            >
              {copied === asset.path ? S.addressCopied : referenceName(asset.path)}
            </button>
            {#if !readOnly}
              <button
                class="theme-btn--icon"
                onclick={() => remove(asset)}
                aria-label={S.deleteImage}
                title={S.deleteImage}
              >
                <Icon name="trash" size="1rem" />
              </button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>
