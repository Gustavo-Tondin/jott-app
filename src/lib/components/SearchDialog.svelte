<script>
  // Searching the whole notebook, over whatever screen is open.
  //
  // A dialog rather than a screen: a search is a question you ask in passing,
  // and answering it should not cost the place you were in. Ctrl+F (or Ctrl+K)
  // opens it, Escape closes it, and picking a hit closes it and goes there.
  //
  // It decides nothing about what matches — `search` in the core does, and
  // hands back two answers plus everything needed to open each hit, so no path
  // is ever taken apart here.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import Icon from "./Icon.svelte";

  let {
    /// Called when the dialog wants to go away.
    onClose,
    /// Takes a task hit's list address and its id, when it has one.
    onOpenList,
    /// Takes a note hit's `(path, folder)`.
    onOpenNote,
    onError,
  } = $props();

  let query = $state("");
  let results = $state({ tasks: [], notes: [], truncated: false });
  /// A query is in flight. Only used to keep the empty state honest: "nothing
  /// found" must not flash while the answer is still coming.
  let asking = $state(false);

  // The box answers as you type, so the search runs on a pause rather than on
  // every keystroke — the core reads note bodies from disk, and a five-letter
  // word would otherwise walk the notebook five times.
  const DEBOUNCE_MS = 150;
  let timer = null;

  $effect(() => {
    const asked = query;
    clearTimeout(timer);
    if (!asked.trim()) {
      results = { tasks: [], notes: [], truncated: false };
      asking = false;
      return;
    }
    asking = true;
    timer = setTimeout(async () => {
      try {
        const answer = await api.search(asked);
        // A slower earlier query must not overwrite a newer answer.
        if (asked !== query) return;
        results = answer ?? { tasks: [], notes: [], truncated: false };
      } catch (e) {
        onError?.(e);
      } finally {
        if (asked === query) asking = false;
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  let empty = $derived(
    query.trim() && !asking && results.tasks.length === 0 && results.notes.length === 0,
  );

  function open(hit) {
    if (hit.kind === "note") onOpenNote?.(hit.path, hit.folder);
    else onOpenList?.(hit.path, hit.id);
    onClose?.();
  }

  function onKey(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    // Swallowed: the shell's own Escape would close the inspector underneath.
    event.stopPropagation();
    onClose?.();
  }

  /// Where a hit lives, as one readable line: `Tasks · Inbox`.
  const place = (hit) => [hit.workspace, hit.container].filter(Boolean).join(" · ");
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- Mounted outside the window (App.svelte), so it declares its own ground:
     a dialog is content, and opens over the panel — canvas, not chrome. -->
<div
  class="theme-modal-backdrop search__backdrop"
  data-region="canvas"
  role="presentation"
  onpointerdown={(e) => e.target === e.currentTarget && onClose?.()}
  onkeydown={onKey}
>
  <div class="theme-modal theme-modal--wide search" role="dialog" aria-label={S.findTitle}>
    <div class="search__field">
      <Icon name="magnifying-glass" size="1rem" />
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="theme-input search__input"
        type="text"
        autofocus
        bind:value={query}
        placeholder={S.findPlaceholder}
        aria-label={S.findTitle}
      />
      <button class="theme-btn--icon" aria-label={S.cancel} title={S.cancel} onclick={() => onClose?.()}>
        <Icon name="x" size="1rem" />
      </button>
    </div>

    <div class="search__results">
      {#if !query.trim()}
        <p class="search__hint">{S.findHint}</p>
      {:else if empty}
        <p class="search__hint">{S.findNothing(query.trim())}</p>
      {:else}
        {#each [{ label: S.findTasks, hits: results.tasks }, { label: S.findNotes, hits: results.notes }] as section (section.label)}
          {#if section.hits.length > 0}
            <p class="search__section">{section.label}</p>
            {#each section.hits as hit (`${hit.folder}/${hit.path}/${hit.id ?? hit.title}`)}
              <button class="theme-row search__hit" onclick={() => open(hit)}>
                <span class="search__hit-main">
                  <span class="search__hit-title" class:search__hit-title--done={hit.done}>
                    {hit.title}
                  </span>
                  {#if hit.snippet}
                    <span class="search__hit-snippet">{hit.snippet}</span>
                  {/if}
                </span>
                <span class="search__hit-place">
                  {place(hit)}{#if hit.done}&nbsp;· {S.findDone}{/if}
                </span>
              </button>
            {/each}
          {/if}
        {/each}
        {#if results.truncated}
          <p class="search__hint search__hint--more">{S.findMore}</p>
        {/if}
      {/if}
    </div>
  </div>
</div>
