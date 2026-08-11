<script>
  // Tags management (reestruturação 2026-07-30): the user's tags and their
  // colours, from `.jott/tags.json`. A tag's colour is what shows as a pill on
  // a task card and colour+text in the inspector. Opened from the sidebar
  // hamburger.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askName } from "../services/dialog.js";
  import { makeAct } from "../services/act.js";

  let { tags = [], onChanged, onError } = $props();

  // No `load`: the catalogue rides in with the snapshot, so refreshing the
  // shell is the reload. Callbacks wrapped — see services/act.js.
  const act = makeAct({
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  const add = () =>
    act(async () => {
      const name = await askName(S.newTagName, "", { confirm: S.create });
      if (!name) return;
      await api.setTag(name, null);
    });

  const setColor = (name, color) => act(() => api.setTag(name, color));
  const remove = (name) => act(() => api.removeTag(name));
</script>

<section class="tags-view">
  <header class="tags-view__header">
    <h2 class="theme-title tags-view__title">{S.tagsTitle}</h2>
    <button class="theme-btn theme-btn--primary" onclick={add}>{S.newTagName}</button>
  </header>

  {#if tags.length === 0}
    <p class="tags-view__empty">{S.tagsEmpty}</p>
  {:else}
    <ul class="tags-view__list">
      {#each tags as tag (tag.name)}
        <li class="theme-row tags-view__item">
          <span
            class="theme-swatch theme-swatch--lg tags-view__swatch"
            style={`--tag-color: ${tag.color || "var(--theme-brand)"}`}
          ></span>
          <span class="tags-view__name">#{tag.name}</span>
          <input
            type="color"
            class="tags-view__color"
            value={tag.color || "#0080ff"}
            aria-label={`${tag.name} colour`}
            onchange={(e) => setColor(tag.name, e.currentTarget.value)}
          />
          <button class="theme-btn tags-view__delete" onclick={() => remove(tag.name)}>
            {S.deleteTag}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>
