<script>
  // Trash — the internal trash (`.jott/trash/`), opened from the sidebar
  // hamburger. Lists what was deleted and restores it (reestruturação
  // 2026-07-30). Items clear on their own after the retention window.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { formatDate } from "../services/dates.js";

  let { onChanged, onError, reloadKey = 0, dateFormat = "mm/dd/yyyy" } = $props();

  let entries = $state([]);

  $effect(() => {
    reloadKey;
    load();
  });

  async function load() {
    try {
      entries = await api.trashEntries();
    } catch (e) {
      onError?.(e);
    }
  }

  async function restore(id) {
    try {
      await api.restoreFromTrash(id);
      await load();
      onChanged?.();
    } catch (e) {
      onError?.(e);
    }
  }
</script>

<section class="trash-view">
  <h2 class="theme-title trash-view__title">{S.trashTitle}</h2>
  <p class="trash-view__hint">{S.trashHint}</p>

  {#if entries.length === 0}
    <p class="trash-view__empty">{S.trashEmpty}</p>
  {:else}
    <ul class="trash-view__list">
      {#each entries as entry (entry.id)}
        <li class="theme-row trash-view__item">
          <span class="trash-view__label">{entry.label}</span>
          <span class="trash-view__origin">{entry.origin}</span>
          <span class="trash-view__date">{formatDate(entry.deleted, dateFormat)}</span>
          <button class="theme-btn trash-view__restore" onclick={() => restore(entry.id)}>
            {S.restore}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
