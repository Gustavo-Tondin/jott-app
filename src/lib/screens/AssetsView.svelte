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
  import { askConfirm, askName, DELETING } from "../services/dialog.js";
  import { assetUrl, importBrought } from "../services/assets.js";
  import { acceptsFiles } from "../actions/acceptsFiles.js";
  import { filesFromInput } from "../services/gesture.js";
  import { makeAct, makeLoad } from "../services/act.js";
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
    /// `(url) => Promise<void>` — a picture that is only on the web. Asking
    /// before fetching it is the shell's business (principle 9), and so is the
    /// dialog that explains which host is contacted.
    onRemoteImage,
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

  // The one shape every screen in this app uses to change the notebook: do
  // it, re-read, tell the shell, route a failure to the banner (`act.js`).
  // Four handlers here were each carrying their own copy of it.
  const load = makeLoad({
    read: async () => ({
      assets: (await api.assets()) ?? [],
      // A second question, asked after the first: a file whose usage is not
      // known yet reads as "not used" for a moment rather than as nothing.
      usage: (await api.assetUsage()) ?? {},
    }),
    apply: (read) => {
      assets = read.assets;
      usage = read.usage;
    },
    onError: (e) => onError?.(e),
  });

  const act = makeAct({
    load,
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  /// Everything here writes through `act`, and everything here is busy while
  /// it does: importing a photo is the one action on this screen slow enough
  /// to be worth saying so.
  async function working(fn) {
    busy = true;
    try {
      return await act(fn);
    } finally {
      busy = false;
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

  /// The file input, and the two gestures, are one question with three doors:
  /// here are some files, put them in the library.
  function add(event) {
    const files = filesFromInput(event.currentTarget);
    if (files.length) take({ files, paths: [], remote: "", types: [] });
  }

  /// A file handed to the library — chosen, dropped on it, or pasted anywhere
  /// on the screen. This screen IS the library, so it is the most obvious
  /// thing in the app to hand a file to (user call, 2026-08-19).
  function take(brought) {
    if (brought.files.length || brought.paths.length) {
      return working(() => importBrought(brought));
    }
    // Nothing local, but a picture on the web: fetching it is the shell's to
    // ask about — the dialog that explains the connection is mounted once, up
    // there, and is the same one the note uses.
    if (brought.remote) return working(() => onRemoteImage?.(brought.remote));
    onError?.(S.noFileInGesture(brought.types ?? []));
  }

  /// Renaming, which the core makes safe: every note and task pointing at the
  /// file is repointed in the same breath (`Notebook::rename_asset`). Leaving
  /// the extension off is allowed — the old one comes along, because a person
  /// renaming `IMG_2049.jpg` to `férias` means `férias.jpg`.
  async function rename(asset) {
    const next = await askName(S.promptRenameFile(asset.name), asset.name);
    if (next && next !== asset.name) act(() => api.renameAsset(asset.path, next));
  }

  async function remove(asset) {
    // The one delete in this app whose consequence is somewhere else: the
    // file goes to the trash, and every note and task pointing at it is left
    // pointing at nothing. Saying how many, BEFORE rather than after (user
    // call, 2026-08-19) — the screen already knows, and knowing and not
    // saying is the worst of the three options.
    const places = placesFor(asset).length;
    const ok = await askConfirm(S.confirmDeleteAsset(asset.name), {
      ...DELETING,
      detail: places ? `${S.assetInUseWarning(places)} ${S.goesToTrash}` : S.goesToTrash,
    });
    if (ok) act(() => api.deleteAsset(asset.path));
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

<!-- Paste is listened for on the DOCUMENT here: this screen has nothing to
     type in, so a paste is delivered to `<body>` and would never reach the
     section (measured 2026-08-19). -->
<section
  class="assets-view"
  class:assets-view--taking={dragging}
  use:acceptsFiles={{
    onFiles: take,
    disabled: readOnly,
    paste: "document",
    over: (active) => (dragging = active),
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
                onclick={() => rename(asset)}
                aria-label={S.renameFile}
                title={S.renameFile}
              >
                <Icon name="pencil" size="1rem" />
              </button>
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
