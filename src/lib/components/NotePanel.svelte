<script>
  // The right panel while a note is open (wireframe "Editor screen scroll down
  // - side panel").
  //
  // The formatting controls are the middle of it, not the whole of it: the
  // wireframe draws the same head and foot the task inspector has — a way to
  // fold the panel away and a ⋮ above, where the note lives and a trash below
  // (user report, 2026-08-19: "faltam o header e o footer"). That is the shape
  // every tenant of this panel keeps, and the note was the one breaking it.
  //
  // What goes IN the head and the foot is the shell's (App.svelte): the same
  // actions the page's ••• offers, and the same move the board's cards make.
  // This component only says where they sit.
  import Icon from "./Icon.svelte";
  import Menu from "./Menu.svelte";
  import FormatBar from "./FormatBar.svelte";
  import { S } from "../services/strings.js";

  let {
    /// `(id) => void` — a formatting command, by the id the registry knows.
    onRun,
    /// Command ids the formatting bar leaves out — see FormatBar's own note.
    hidden = [],
    /// The note's own actions (App's `noteActions`), for the ⋮.
    menu = [],
    /// Where the note is filed, as a label, and where it could go:
    /// `[{ label, context, run }]`. An empty list draws the place as plain
    /// text — there is nowhere else to put it.
    where = "",
    targets = [],
    onDelete,
    /// Folds the panel away — the same gesture, and the same glyph, the
    /// inspector's head carries.
    onClose,
    readOnly = false,
  } = $props();
</script>

<aside class="note-panel">
  <div class="note-panel__toolbar theme-pane-head">
    <button
      class="theme-btn theme-btn--icon"
      onclick={() => onClose?.()}
      aria-label={S.collapsePanel}
      title={S.collapsePanel}
    >
      <Icon name="sidebar-simple" size="1.125rem" />
    </button>
    <span class="note-panel__gap"></span>
    {#if menu.length > 0}
      <Menu items={menu} align="end">
        {#snippet trigger({ toggle })}
          <button
            class="theme-btn theme-btn--icon"
            onclick={toggle}
            aria-label={S.noteOptions}
            title={S.noteOptions}
          >
            <Icon name="dots-three-vertical" size="1.125rem" />
          </button>
        {/snippet}
      </Menu>
    {/if}
  </div>

  <div class="note-panel__scroll">
    <FormatBar {onRun} {hidden} layout="column" />
  </div>

  <footer class="note-panel__footer theme-pane-foot">
    <!-- Where the note lives, and the way to move it — the same pairing the
         task inspector's foot has, because it is the same question asked of a
         different document. -->
    {#if readOnly || targets.length === 0}
      <span class="note-panel__origin">
        <Icon name="folder" size="1rem" />
        <span class="note-panel__origin-name">{where}</span>
      </span>
    {:else}
      <Menu align="start" items={targets}>
        {#snippet trigger({ toggle })}
          <button
            class="theme-btn theme-btn--sm note-panel__origin note-panel__origin--button"
            onclick={toggle}
            aria-label={S.moveNotesTo}
            title={S.moveNotesTo}
          >
            <Icon name="folder" size="1rem" />
            <span class="note-panel__origin-name">{where}</span>
          </button>
        {/snippet}
      </Menu>
    {/if}
    <button
      class="theme-btn theme-btn--icon"
      onclick={() => onDelete?.()}
      disabled={readOnly}
      aria-label={S.deleteNote}
      title={S.deleteNote}
    >
      <Icon name="trash" size="1.125rem" />
    </button>
  </footer>
</aside>
