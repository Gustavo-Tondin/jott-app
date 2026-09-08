<script>
  // Suggestions, in the right-hand panel — what could still be pulled into
  // a day, grouped by why it is offered. Same pact as the task inspector it
  // shares the panel with: fixed head, scrolling middle. It loads its own
  // list: the panel outlives the screen that opened it (a day picked underneath).
  import { tick } from "svelte";
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { listName, listLabel } from "../services/paths.js";
  import { dotStyle } from "../services/accent.js";
  import { formatDate, formatDayMonth } from "../services/dates.js";
  import { ensureTaskId } from "../services/taskId.js";
  import { makeScreen } from "../services/act.js";
  import { played } from "../services/motion.js";
  import Icon from "./Icon.svelte";

  let {
    /// The ISO day these would be pulled into, or null for today.
    day = null,
    dateFormat = "mm/dd/yyyy",
    reloadKey = 0,
    /// `(key) => boolean` — is this part of the app switched on?
    f = () => true,
    /// `(item) => {label, color} | null` — where an item came from, for the
    /// badge a card wears outside its space (services/origin.js). Null when
    /// the screen IS the space, and nothing is said.
    origin = null,
    /// The narrow shell (shell/compact.js): the panel is a bottom sheet,
    /// dismissed by tapping the page behind it or pulling it down by its
    /// handle — so the head drops its ×.
    compact = false,
    onChanged,
    onError,
    onClose,
  } = $props();

  let suggestions = $state([]);

  $effect(() => {
    day;
    reloadKey;
    load();
  });

  const { load, act } = makeScreen({
    read: () => api.groupedSuggestions(day),
    apply: (read) => {
      suggestions = read ?? [];
      // The list that comes back no longer holds the row that left.
      leaving = null;
    },
    onChanged: () => onChanged?.(),
    onError: (e) => onError?.(e),
  });

  // A suggestion may have no id yet — ids are handed out only when a task
  // needs to be addressed, and pulling it into a day is exactly that.
  const pull = (list, task) =>
    act(async () => {
      const id = await ensureTaskId(list, task);
      await api.pullInto(day, list, id);
    });

  // TAKING ONE PLAYS BEFORE IT IS WRITTEN: the row lifts out of the list and
  // the gap closes behind it, so the eye follows the task up and out towards
  // the day, where the card rises into place. The stylesheet owns how long
  // (suggestions.css); nothing playing (jsdom, reduced motion) writes at once.
  const LIFT = new Set(["suggestions-pane-lift"]);
  /// The key of the row on its way out — one at a time: a second press while
  /// one is leaving would write two tasks off one animation.
  let leaving = $state(null);

  async function take(event, entry, key) {
    if (leaving) return;
    const row = event.currentTarget.closest("li");
    leaving = key;
    await tick();
    await played(row, LIFT);
    pull(entry.path, entry.task);
  }

  // Why something is being offered — the core's own grouping. There is no
  // "From the lists" heading: each list gets its own section (`byList`).
  const REASONS = [
    { key: "urgent", label: S.groupUrgent },
    { key: "soon", label: S.groupSoon },
    // What was in today and left it: a way back to an old decision.
    { key: "recent", label: S.groupRecent },
  ];

  let reasons = $derived(
    REASONS.map((reason) => ({
      key: reason.key,
      label: reason.label,
      items: suggestions.filter((entry) => entry.group === reason.key),
    })).filter((section) => section.items.length > 0),
  );

  /// One section per list, in the order the core offered them.
  let byList = $derived.by(() => {
    const out = new Map();
    for (const entry of suggestions) {
      if (entry.group !== "lists") continue;
      if (!out.has(entry.path)) out.set(entry.path, []);
      out.get(entry.path).push(entry);
    }
    return [...out].map(([path, items]) => {
      // The address the core hands over, never the folder or the file stem:
      // fixed spaces are filed as `jott.*`, and every tasks list is
      // `task-list.md`. The heading is the origin badge (services/origin.js).
      const first = items[0] ?? { path };
      const from = origin?.(first) ?? null;
      return {
        key: `list:${path}`,
        label: from?.label ?? listLabel(first),
        color: from?.color ?? null,
        items,
      };
    });
  });

  // Folded shut by clicking the heading. Local to the panel, like the
  // sidebar's groups: not something the notebook carries to another machine.
  let collapsed = $state(new Set());
  const isCollapsed = (key) => collapsed.has(key);
  function toggle(key) {
    const next = new Set(collapsed);
    if (!next.delete(key)) next.add(key);
    collapsed = next;
  }

  let title = $derived(
    day ? S.suggestionsFor(formatDayMonth(day, dateFormat)) : S.suggestionsForDay,
  );
</script>

<!-- One section, whichever kind: a heading that folds it away, and the rows. -->
{#snippet group(section)}
  <section class="suggestions-pane__group">
    <button
      class="suggestions-pane__group-title"
      aria-expanded={!isCollapsed(section.key)}
      onclick={() => toggle(section.key)}
    >
      <Icon
        name={isCollapsed(section.key) ? "caret-right" : "caret-down"}
        size="0.75rem"
      />
      {#if section.color !== undefined}
        <span class="theme-dot suggestions-pane__dot" style={dotStyle(section.color)} aria-hidden="true"></span>
      {/if}
      <span>{section.label}</span>
      <small class="suggestions-pane__count">{section.items.length}</small>
    </button>

    {#if !isCollapsed(section.key)}
      <ul class="suggestions-pane__list">
        {#each section.items as entry, i (`${entry.path}/${entry.task.id ?? ""}#${i}`)}
          {@const key = `${section.key}:${i}`}
          <!-- The whole row is the pull: a suggestion exists to be pulled. -->
          <li
            class="suggestions-pane__row"
            class:suggestions-pane__row--leaving={leaving === key}
          >
            <button
              class="suggestions-pane__item"
              onclick={(event) => take(event, entry, key)}
              title={S.pull}
            >
              <span class="suggestions-pane__text">{entry.task.text}</span>
              {#if entry.task.due && f("dueDate")}
                <span class="suggestions-pane__meta">
                  <small class="suggestions-pane__due"
                    >{formatDate(entry.task.due, dateFormat)}</small
                  >
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

<aside class="suggestions-pane" class:suggestions-pane--compact={compact}>
  <header class="theme-pane-head suggestions-pane__head">
    <span class="suggestions-pane__title">{title}</span>
    {#if !compact}
      <button
        class="theme-btn--icon"
        onclick={() => onClose?.()}
        aria-label={S.closePanel}
        title={S.closePanel}
      >
        <Icon name="x" size="1rem" />
      </button>
    {/if}
  </header>

  <div class="suggestions-pane__scroll">
    {#if suggestions.length === 0}
      <p class="suggestions-pane__empty">{S.noSuggestions}</p>
    {:else}
      {#each reasons as section (section.key)}
        {@render group(section)}
      {/each}

      <!-- Two different questions, so a rule between them: what is pressing,
           and where to pull from. -->
      {#if reasons.length > 0 && byList.length > 0}
        <hr class="theme-divider suggestions-pane__rule" />
      {/if}

      {#each byList as section (section.key)}
        {@render group(section)}
      {/each}
    {/if}
  </div>
</aside>
