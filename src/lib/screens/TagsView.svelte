<script>
  // Tags management (reestruturação 2026-07-30): the user's tags and their
  // colours, from `.jott/tags.json`. A tag's colour is what shows as a pill on
  // a task card and colour+text in the inspector. Opened from the sidebar
  // hamburger.
  //
  // Since 2026-08-24 the screen lists every `#word` IN USE, not only the
  // catalogued ones: a tag typed into a task and never coloured is a row here
  // too, with its count, so "which tags do I have?" has one answer. The
  // counts come from `tag_usage` (it walks every list — asked when the screen
  // opens, never per render); the catalogue rides in with the snapshot.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { askConfirm, askName } from "../services/dialog.js";
  import { makeScreen } from "../services/act.js";
  import Badge from "../components/Badge.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import Loading from "../components/Loading.svelte";
  import Icon from "../components/Icon.svelte";

  /// `onSearch(name)`: the shell opens the notebook search on `#name` — the
  /// core reads the prefix (core/search.rs), so this page is the door to
  /// "where is this tag used?" and needs no screen of its own (2026-08-24).
  let { tags = [], onSearch, onChanged, onError, reloadKey = 0 } = $props();

  let usage = $state([]);
  let loaded = $state(false);
  let query = $state("");

  $effect(() => {
    reloadKey;
    load();
  });

  // Callbacks wrapped — see services/act.js.
  const { load, act } = makeScreen({
    read: () => api.tagUsage(),
    apply: (read) => {
      usage = read ?? [];
      loaded = true;
    },
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  /// One row per name: whether the catalogue (the picker) knows it, and the
  /// count where the word is in use. Most used first, then by name — the
  /// order the question "what do I tag things with?" wants.
  let rows = $derived.by(() => {
    const byName = new Map();
    for (const tag of tags) byName.set(tag.name, { name: tag.name, count: 0, catalogued: true });
    for (const use of usage) {
      const row = byName.get(use.name);
      if (row) row.count = use.count;
      else byName.set(use.name, { name: use.name, count: use.count, catalogued: false });
    }
    return [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });

  // The filter earns its place only once the list is longer than a glance.
  const FILTER_FROM = 8;
  let needle = $derived(query.trim().toLocaleLowerCase());
  let shown = $derived(needle ? rows.filter((r) => r.name.toLocaleLowerCase().includes(needle)) : rows);

  const add = () =>
    act(async () => {
      const name = await askName(S.newTagName, "", { confirm: S.create });
      if (!name) return;
      await api.setTag(name, null);
    });

  const remove = async (name) => {
    // Not DELETING: removing a tag takes it out of the picker and nothing else — the
    // shared "goes to the trash" detail would promise a trip that never
    // happens (core: `remove_tag`).
    const ok = await askConfirm(S.confirmDeleteTag(name), {
      detail: S.tagTextStays,
      danger: S.deleteAction,
      remember: "confirmDeletes",
    });
    if (ok) act(() => api.removeTag(name));
  };
</script>

<section class="tags-view">
  <header class="tags-view__header">
    <h2 class="theme-title tags-view__title">{S.tagsTitle}</h2>
    <button class="theme-btn theme-btn--primary" onclick={add}>{S.newTagName}</button>
  </header>

  {#if rows.length >= FILTER_FROM}
    <div class="theme-filter tags-view__filter">
      <Icon name="magnifying-glass" size="1rem" />
      <input
        class="theme-filter__field"
        type="search"
        bind:value={query}
        placeholder={S.tagsFilter}
        aria-label={S.tagsFilter}
      />
    </div>
  {/if}

  {#if !loaded && rows.length === 0}
    <Loading label={S.tagsLoading} />
  {:else if rows.length === 0}
    <!-- Outlined, not primary: the header already carries the same verb, and
         two filled buttons saying the same thing on an otherwise blank screen
         is one call to action too many. -->
    <EmptyState icon="tag" title={S.tagsEmpty} hint={S.tagsEmptyHint}>
      <button class="theme-btn theme-btn--outline theme-btn--sm" onclick={add}>{S.newTagName}</button>
    </EmptyState>
  {:else if shown.length === 0}
    <EmptyState icon="magnifying-glass" title={S.tagsFilterEmpty} compact />
  {:else}
    <ul class="theme-task-list tags-view__list">
      {#each shown as tag (tag.name)}
        <li class="theme-row tags-view__item" class:tags-view__item--uncatalogued={!tag.catalogued}>
          <span class="tags-view__name">
            <!-- The tag as the card draws it: a neutral badge. A tag has no
                 colour of its own since 2026-08-26 — the colour a card wears
                 is its space's. -->
            <Badge label={`#${tag.name}`} class="tags-view__badge" />
            <!-- The count is the second line's fact; "not in the picker" is
                 what a word typed into a task and never saved looks like. -->
            <span class="tags-view__meta">
              {#if loaded}{S.tagUses(tag.count)}{/if}
              {#if !tag.catalogued}<span class="tags-view__meta-note">· {S.tagUncatalogued}</span>{/if}
            </span>
          </span>
          <button
            class="theme-btn--icon tags-view__search"
            onclick={() => onSearch?.(tag.name)}
            aria-label={S.searchTag(tag.name)}
            title={S.searchTag(tag.name)}
          >
            <Icon name="magnifying-glass" size="1rem" />
          </button>
          <!-- The same trash the inspector's footer wears (user call,
               2026-08-13): one glyph for "throw this away", wherever the app
               offers it. As a worded button it was the widest thing in the row
               and read as the row's main action. An uncatalogued word has no
               colour to forget, so it has no bin — the glyph would be a lie. -->
          {#if tag.catalogued}
            <button
              class="theme-btn--icon tags-view__delete"
              onclick={() => remove(tag.name)}
              aria-label={S.deleteTag}
              title={S.deleteTag}
            >
              <Icon name="trash" size="1.125rem" />
            </button>
          {:else}
            <span class="tags-view__gap" aria-hidden="true"></span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>
