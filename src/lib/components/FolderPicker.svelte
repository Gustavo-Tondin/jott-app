<script>
  // The app's own folder browser — Android's answer to "where does the
  // notebook live?".
  //
  // The desktop never opens this: it has the system's picker, which knows
  // about bookmarks, network mounts and typing a path, and reimplementing that
  // would be worse at all three. Android has no picker to open at all
  // (`pick_notebook_folder` answers null there — Tauri's dialog plugin has no
  // `pick_folder` on that platform), and the platform's own answer, the
  // Storage Access Framework, hands back a `content://` URI that the core
  // cannot open. With the all-files permission granted, folders are folders
  // again, and browsing them is a list.
  //
  // It only ever lists FOLDERS. The question is which one holds the notebook,
  // and every photo on the phone in between would only be scrolled past.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askName } from "../services/dialog.js";
  import Modal from "./Modal.svelte";
  import Icon from "./Icon.svelte";

  let {
    /// Where to open. Null starts at the top of shared storage.
    start = null,
    /// `(path) => void` — the folder the user settled on.
    onChoose,
    onClose,
    onError,
  } = $props();

  let listing = $state(null);
  let busy = $state(false);

  $effect(() => {
    load(start);
  });

  async function load(path) {
    busy = true;
    try {
      listing = await api.listFolders(path);
    } catch (e) {
      onError?.(e);
    } finally {
      busy = false;
    }
  }

  async function addFolder() {
    const name = await askName(S.newFolderName, "", { confirm: S.newFolder });
    if (!name) return;
    busy = true;
    try {
      // Straight into the new folder: making one is how someone says where the
      // notebook goes, so landing anywhere else would ask the question twice.
      await api.createFolder(listing.path, name);
      await load(`${listing.path}/${name}`);
    } catch (e) {
      onError?.(e);
    } finally {
      busy = false;
    }
  }
</script>

<Modal label={S.browseFolders} backdropClass="folder-picker__backdrop" panelClass="folder-picker" {onClose}>
  <header class="folder-picker__head">
    <h2 class="theme-title theme-title--sm">{S.browseFolders}</h2>
    <p class="folder-picker__path">{listing?.path ?? ""}</p>
  </header>

  <ul class="folder-picker__list">
    {#if listing?.parent}
      <li>
        <button
          class="theme-row folder-picker__row"
          onclick={() => load(listing.parent)}
          disabled={busy}
        >
          <Icon name="arrow-left" />
          <span class="folder-picker__name">{S.parentFolder}</span>
        </button>
      </li>
    {/if}
    {#each listing?.folders ?? [] as folder (folder.path)}
      <li>
        <button
          class="theme-row folder-picker__row"
          onclick={() => load(folder.path)}
          disabled={busy}
        >
          <Icon name="folder" />
          <span class="folder-picker__name">{folder.name}</span>
          {#if folder.notebook}
            <span class="folder-picker__badge">{S.existingNotebook}</span>
          {/if}
        </button>
      </li>
    {/each}
    {#if listing && !listing.folders.length}
      <li class="folder-picker__empty">{S.noSubfolders}</li>
    {/if}
  </ul>

  <footer class="folder-picker__foot">
    <button class="theme-btn" onclick={addFolder} disabled={busy || !listing}>
      {S.newFolder}
    </button>
    <button
      class="theme-btn theme-btn--primary"
      onclick={() => onChoose?.(listing.path)}
      disabled={busy || !listing}
    >
      {S.useThisFolder}
    </button>
  </footer>
</Modal>
