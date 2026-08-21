<script>
  // Trash — the internal trash (`.jott/trash/`), opened from the sidebar
  // hamburger. Lists what was deleted and restores it (reestruturação
  // 2026-07-30). Items clear on their own after the retention window — and,
  // since 2026-08-21, on the user's word: one for good, or all of them.
  import { api } from "../services/api.js";
  import { makeScreen } from "../services/act.js";
  import { S } from "../services/strings.js";
  import { formatDate } from "../services/dates.js";
  import { askConfirm } from "../services/dialog.js";
  import Icon from "../components/Icon.svelte";

  let {
    onChanged,
    onError,
    reloadKey = 0,
    dateFormat = "mm/dd/yyyy",
    readOnly = false,
  } = $props();

  let entries = $state([]);

  $effect(() => {
    reloadKey;
    load();
  });

  const { load, act } = makeScreen({
    read: () => api.trashEntries(),
    apply: (read) => (entries = read),
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  const restore = (id) => act(() => api.restoreFromTrash(id));

  // Deleting for good never rides on `confirmDeletes`: that switch covers
  // the trip TO the trash, which is reversible. This is not, so it asks
  // every time.
  async function purge(entry) {
    const ok = await askConfirm(S.confirmDeleteForever(entry.label), {
      detail: S.deleteForeverDetail,
      danger: S.deleteForever,
    });
    if (ok) act(() => api.purgeFromTrash(entry.id));
  }

  async function empty() {
    const ok = await askConfirm(S.confirmEmptyTrash(entries.length), {
      detail: S.deleteForeverDetail,
      danger: S.emptyTrash,
    });
    if (ok) act(() => api.emptyTrash());
  }
</script>

<section class="trash-view">
  <header class="trash-view__head">
    <h2 class="theme-title trash-view__title">{S.trashTitle}</h2>
    {#if !readOnly && entries.length > 0}
      <button class="theme-btn theme-btn--danger theme-btn--sm" onclick={empty}>
        <Icon name="trash" size="1rem" />
        {S.emptyTrash}
      </button>
    {/if}
  </header>
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
          <span class="trash-view__left" class:trash-view__left--soon={entry.daysLeft != null && entry.daysLeft <= 3}>
            {entry.daysLeft == null ? S.trashKeptForever : S.trashDaysLeft(entry.daysLeft)}
          </span>
          {#if !readOnly}
            <span class="trash-view__actions">
              <button
                class="theme-btn--icon trash-view__restore"
                onclick={() => restore(entry.id)}
                aria-label={S.restoreItem}
                title={S.restoreItem}
              >
                <Icon name="arrow-clockwise" size="1rem" />
              </button>
              <button
                class="theme-btn--icon trash-view__purge"
                onclick={() => purge(entry)}
                aria-label={S.deleteForever}
                title={S.deleteForever}
              >
                <Icon name="trash" size="1rem" />
              </button>
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
