<script>
  // The head of a note, drawn on its card. Markdown comes from
  // `services/notePreview.js`, looks from `note-preview.css`; this only maps
  // block → element. SPANS, not divs: the whole card is a `<button>`, which
  // may only hold phrasing content — a `<p>` inside it is invalid HTML the
  // browser "fixes" by closing the button early. Level travels as `data-level`.
  import { previewBlocks } from "../services/notePreview.js";
  import Icon from "./Icon.svelte";
  import { measured } from "../actions/measure.js";

  let {
    /// The markdown the core sent (`NoteEntry.preview`).
    markdown = "",
    /// What to draw when there is none.
    empty = "",
  } = $props();

  let blocks = $derived(previewBlocks(markdown));

  /// Whether the clamp actually cut something — the dots are only drawn when
  /// there IS more. Measured, because only the layout knows: the same markdown
  /// wraps differently at every card width, so `measured` re-asks on resize
  /// and the effect re-asks when the note changes.
  let root = $state(null);
  let more = $state(false);

  const check = () => {
    if (!root) return;
    more = root.scrollHeight > root.clientHeight + 1;
  };

  $effect(() => {
    blocks;
    check();
  });
</script>

{#if blocks.length > 0}
  <span class="note-preview" bind:this={root} use:measured={check}>
    {#each blocks as block}
      {#if block.kind === "rule"}
        <span class="note-preview__rule"></span>
      {:else if block.kind === "code"}
        <span class="note-preview__code">{block.text}</span>
      {:else if block.kind === "heading"}
        <span class="note-preview__heading" data-level={block.level}>
          {@render spans(block.spans)}
        </span>
      {:else if block.kind === "table"}
        <span class="note-preview__table">
          <Icon name="table" size="1em" />
          <span class="note-preview__text">{@render spans(block.spans)}</span>
        </span>
      {:else if block.kind === "quote"}
        <span class="note-preview__quote">{@render spans(block.spans)}</span>
      {:else if block.kind === "bullet" || block.kind === "ordered" || block.kind === "task"}
        <span class="note-preview__item">
          {#if block.kind === "task"}
            <span class="note-preview__box" class:note-preview__box--done={block.done}></span>
          {:else}
            <span class="note-preview__marker">
              {block.kind === "ordered" ? block.marker : "•"}
            </span>
          {/if}
          <span class="note-preview__text" class:note-preview__text--done={block.done}>
            {@render spans(block.spans)}
          </span>
        </span>
      {:else}
        <span class="note-preview__line">{@render spans(block.spans)}</span>
      {/if}
    {/each}
  </span>
  {#if more}
    <!-- Outside the clamped span: inside it the clamp would swallow them. -->
    <span class="note-preview__more" aria-hidden="true">…</span>
  {/if}
{:else if empty}
  <span class="note-preview note-preview__line">{empty}</span>
{/if}

{#snippet spans(runs)}
  {#each runs as run}
    <span
      class:note-preview__strong={run.strong}
      class:note-preview__em={run.em}
      class:note-preview__strike={run.strike}
      class:note-preview__underline={run.underline}
      class:note-preview__mono={run.code}>{run.text}</span
    >
  {/each}
{/snippet}
