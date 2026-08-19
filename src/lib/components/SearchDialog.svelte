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
  import Modal from "./Modal.svelte";

  let {
    /// What to start looking for. Empty is the ordinary case (Ctrl+F asks a
    /// blank box); a value means something else asked the question on the
    /// user's behalf — an ambiguous `[[link]]`, so far (2026-08-19).
    query: initial = "",
    /// Narrow the question to one space, by its root-relative path — what the
    /// page ⋮ asks (2026-08-17). Null is the whole notebook, which is Ctrl+F.
    scope = null,
    /// How that space is called on screen, for the box to say where it is
    /// looking. The shell knows the readable name; this dialog never derives
    /// one from a path.
    scopeLabel = "",
    /// Called when the dialog wants to go away.
    onClose,
    /// Takes a task hit's list address and its id, when it has one.
    onOpenList,
    /// Takes a note hit's `(path, folder)`.
    onOpenNote,
    onError,
  } = $props();

  // Seeded once on purpose: the dialog owns the text from the moment it
  // opens, and following the prop afterwards would overwrite what the user
  // is typing. The ignore is the documented way to say "yes, first value
  // only" (svelte.dev/e/state_referenced_locally).
  // svelte-ignore state_referenced_locally
  let query = $state(initial);
  let results = $state({ tasks: [], notes: [], truncated: false });
  /// A query is in flight. Only used to keep the empty state honest: "nothing
  /// found" must not flash while the answer is still coming.
  let asking = $state(false);

  // The box answers as you type, so the search runs on a pause rather than on
  // every keystroke — the core reads note bodies from disk, and a five-letter
  // word would otherwise walk the notebook five times.
  const DEBOUNCE_MS = 150;
  let timer = null;

  /// What the box calls the place it is searching — empty when it is the whole
  /// notebook, which needs no saying.
  let scopeName = $derived(scope ? scopeLabel || scope : "");

  $effect(() => {
    const asked = query;
    // Re-runs when the scope changes too: the same words asked of another
    // place are another question.
    scope;
    clearTimeout(timer);
    if (!asked.trim()) {
      results = { tasks: [], notes: [], truncated: false };
      asking = false;
      return;
    }
    asking = true;
    timer = setTimeout(async () => {
      try {
        const answer = await api.search(asked, null, scope);
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

  /// Where a hit lives, as one readable line: `Tasks · Inbox`.
  const place = (hit) => [hit.space, hit.container].filter(Boolean).join(" · ");
</script>

<Modal
  label={S.findTitle}
  wide
  backdropClass="search__backdrop"
  panelClass="search"
  onClose={() => onClose?.()}
>
  <div class="search__field">
    <Icon name="magnifying-glass" size="1rem" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="theme-input search__input"
      type="text"
      autofocus
      bind:value={query}
      placeholder={scopeName ? S.findIn(scopeName) : S.findPlaceholder}
      aria-label={scopeName ? S.findIn(scopeName) : S.findTitle}
    />
    <button class="theme-btn--icon" aria-label={S.cancel} title={S.cancel} onclick={() => onClose?.()}>
      <Icon name="x" size="1rem" />
    </button>
  </div>

  <div class="search__results">
    {#if !query.trim()}
      <p class="search__hint">{scopeName ? S.findHintIn(scopeName) : S.findHint}</p>
    {:else if empty}
      <p class="search__hint">
        {scopeName
          ? S.findNothingIn(query.trim(), scopeName)
          : S.findNothing(query.trim())}
      </p>
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
</Modal>
