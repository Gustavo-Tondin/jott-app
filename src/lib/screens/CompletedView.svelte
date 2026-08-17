<script>
  // Completed tasks, aggregated across every space of the notebook — the
  // Completed screen is a view over all the `Completed.md` files, not one of
  // them (spec 3.5). Unchecking sends the task back to the list it came from;
  // the core reads that from the `origin` recorded in the file.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { folderOf } from "../services/paths.js";

  let { readOnly, onChanged, onError, reloadKey } = $props();

  /// `{ path, task }` pairs — the path is the Completed list the task sits
  /// in, and is what uncompleting must address (there is one per space).
  let items = $state([]);

  $effect(() => {
    reloadKey;
    load();
  });

  async function load() {
    try {
      items = await api.completedTasks();
    } catch (e) {
      onError(e);
    }
  }

  async function uncomplete(item) {
    try {
      await api.uncompleteTask(item.path, item.task.id);
      await load();
      onChanged();
    } catch (e) {
      onError(e);
    }
  }

</script>

<h2 class="theme-title completed-view__title">{S.completed}</h2>

{#if items.length === 0}
  <p class="completed-view__empty">{S.nothingCompleted}</p>
{:else}
  <ul class="completed-view__list">
    <!-- See ListView: position is part of the key so a duplicated id cannot
         take the whole screen down. -->
    {#each items as item, i (`${item.path}:${item.task.id ?? ""}#${i}`)}
      <li class="completed-view__item">
        <input
          class="theme-checkbox completed-view__checkbox"
          type="checkbox"
          checked={item.task.done}
          disabled={readOnly || !item.task.id}
          onchange={() => uncomplete(item)}
          aria-label={S.uncheck}
        />
        <span class="completed-view__text">{item.task.text}</span>
        <!-- Where the task lives, readable: the space folder of its Completed
             list ("Design/Tasks"), which is how the wireframe names places. -->
        <small class="completed-view__origin">
          {folderOf(item.path)}{#if item.task.origin}
            · {S.goesBackTo(item.task.origin)}{/if}
        </small>
      </li>
    {/each}
  </ul>
{/if}
