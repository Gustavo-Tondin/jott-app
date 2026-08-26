<script>
  // Completed tasks, aggregated across every space of the notebook — the
  // Completed screen is a view over all the `Completed.md` files, not one of
  // them (spec 3.5). Unchecking sends the task back to the list it came from;
  // the core reads that from the `origin` recorded in the file.
  import { api } from "../services/api.js";
  import { makeScreen } from "../services/act.js";
  import { S } from "../services/strings.js";
  import EmptyState from "../components/EmptyState.svelte";
  import { dotStyle } from "../services/accent.js";

  let { readOnly, onChanged, onError, reloadKey, origin = null } = $props();

  /// `{ path, task }` pairs — the path is the Completed list the task sits
  /// in, and is what uncompleting must address (there is one per space).
  let items = $state([]);

  $effect(() => {
    reloadKey;
    load();
  });

  const { load, act } = makeScreen({
    read: () => api.completedTasks(),
    apply: (read) => (items = read),
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  const uncomplete = (item) => act(() => api.uncompleteTask(item.path, item.task.id));

</script>

<h2 class="theme-title completed-view__title">{S.completed}</h2>

{#if items.length === 0}
  <EmptyState icon="check-square" title={S.nothingCompleted} />
{:else}
  <ul class="completed-view__list">
    <!-- See ListView: position is part of the key so a duplicated id cannot
         take the whole screen down. -->
    {#each items as item, i (`${item.path}:${item.task.id ?? ""}#${i}`)}
      {@const from = origin?.(item)}
      <li class="completed-view__item" class:completed-view__item--origin={!!from}>
        {#if from}<span class="theme-origin" style={dotStyle(from.color)} aria-hidden="true"></span>{/if}
        <input
          class="theme-checkbox completed-view__checkbox"
          type="checkbox"
          checked={item.task.done}
          disabled={readOnly || !item.task.id}
          onchange={() => uncomplete(item)}
          aria-label={S.uncheck}
        />
        <span class="completed-view__text">{item.task.text}</span>
        <!-- Where the task lives: the origin badge (the space's readable name,
             in its colour — services/origin.js), never the folder. -->
        <small class="completed-view__origin">
          {#if from}<span>{from.label}</span>{/if}
          {#if item.task.origin}<span>· {S.goesBackTo(item.task.origin)}</span>{/if}
        </small>
      </li>
    {/each}
  </ul>
{/if}
