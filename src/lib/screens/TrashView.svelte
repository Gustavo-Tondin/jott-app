<script>
  // Trash — the internal trash (`.jott/trash/`), opened from the sidebar
  // hamburger. Lists what was deleted and restores it (reestruturação
  // 2026-07-30). Items clear on their own after the retention window — and,
  // since 2026-08-21, on the user's word: one for good, or all of them.
  //
  // Refined 2026-08-24 (Etapa 7): a glyph says what each row WAS (a task, or
  // a file/folder — the two kinds the core keeps), a segmented filter reads a
  // long trash one kind at a time, and the screen says when it is still
  // reading and when there is nothing to read.
  import { api } from "../services/api.js";
  import { makeScreen } from "../services/act.js";
  import { S } from "../services/strings.js";
  import { formatDate } from "../services/dates.js";
  import { askConfirm } from "../services/dialog.js";
  import { segmented } from "../actions/segmented.js";
  import EmptyState from "../components/EmptyState.svelte";
  import Loading from "../components/Loading.svelte";
  import Icon from "../components/Icon.svelte";

  let {
    onChanged,
    onError,
    reloadKey = 0,
    dateFormat = "mm/dd/yyyy",
    readOnly = false,
  } = $props();

  let entries = $state([]);
  let loaded = $state(false);
  /// `"all"`, `"task"` or `"file"` — the kinds the bridge names.
  let kind = $state("all");

  $effect(() => {
    reloadKey;
    load();
  });

  const { load, act } = makeScreen({
    read: () => api.trashEntries(),
    apply: (read) => {
      entries = read ?? [];
      loaded = true;
    },
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  const GLYPH = { task: "check-square", file: "file" };
  const KIND_LABEL = { task: S.trashKindTask, file: S.trashKindFile };

  let tasks = $derived(entries.filter((e) => e.kind === "task").length);
  let files = $derived(entries.length - tasks);
  // The filter is offered only when there is something to tell apart.
  let mixed = $derived(tasks > 0 && files > 0);
  let shown = $derived(kind === "all" || !mixed ? entries : entries.filter((e) => e.kind === kind));

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

  {#if !loaded}
    <Loading label={S.trashLoading} />
  {:else if entries.length === 0}
    <EmptyState icon="trash" title={S.trashEmpty} hint={S.trashEmptyHint} />
  {:else}
    <p class="trash-view__hint">{S.trashHint}</p>

    {#if mixed}
      <div class="theme-segmented trash-view__kinds" role="group" aria-label={S.trashAll} use:segmented>
        {#each [["all", S.trashAll, entries.length], ["task", S.trashTasks, tasks], ["file", S.trashFiles, files]] as [key, label, count] (key)}
          <button
            type="button"
            class="theme-segmented__item"
            class:theme-segmented__item--active={kind === key}
            aria-pressed={kind === key}
            onclick={() => (kind = key)}>{label} <span class="trash-view__count">{count}</span></button
          >
        {/each}
      </div>
    {/if}

    {#if shown.length === 0}
      <EmptyState icon="trash" title={S.trashNoneOfKind} compact />
    {:else}
      <ul class="trash-view__list">
        {#each shown as entry (entry.id)}
          <li class="theme-row trash-view__item">
            <span class="trash-view__glyph" title={KIND_LABEL[entry.kind] ?? entry.kind}>
              <Icon name={GLYPH[entry.kind] ?? "file"} size="1.125rem" label={KIND_LABEL[entry.kind] ?? entry.kind} />
            </span>
            <span class="trash-view__text">
              <span class="trash-view__label">{entry.label}</span>
              <span class="trash-view__origin">{entry.origin}</span>
            </span>
            <!-- The two numbers together: columns of the row on a desktop,
                 a line of their own under the name on a phone (trash-view.css). -->
            <span class="trash-view__when">
              <span class="trash-view__date">{formatDate(entry.deleted, dateFormat)}</span>
              <span class="trash-view__left" class:trash-view__left--soon={entry.daysLeft != null && entry.daysLeft <= 3}>
                {entry.daysLeft == null ? S.trashKeptForever : S.trashDaysLeft(entry.daysLeft)}
              </span>
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
  {/if}
</section>
