<script>
  // The strip above the page. Two shapes, because the mobile wireframes make
  // it a different thing rather than a narrower one:
  //
  //   full     [← →]  ·  TASKS  ·  [⋮]            one quiet uppercase line
  //   compact  Tasks ●                             the screen's name, big
  //
  // In the compact shell the arrows and the ⋮ are NOT here — they moved up
  // into the top bar (shell/TopBar.svelte), which is why both are their own
  // components now. What is left is the name of the place you are in, at the
  // size the wireframe draws it, and it SCROLLS AWAY with the content: it is
  // inside the scroller, not pinned above it, so the screen gets its full
  // height back the moment you start reading (Home/Editor "scrolled down").
  //
  // The compact header sits on the CHROME ground, not the canvas: the
  // wireframe rounds the canvas's top corners BELOW it, so the header belongs
  // to the frame around the page rather than to the page.
  import { S } from "../services/strings.js";
  import { dotStyle as dotStyleOf } from "../services/accent.js";
  import PageMenu from "./PageMenu.svelte";
  import PageNav from "./PageNav.svelte";

  let {
    title,
    canBack = false,
    canForward = false,
    onBack,
    onForward,
    onRenameTitle,
    menu = [],
    /// The narrow shape (shell/compact.js). Not a prop the header decides —
    /// the shell measures once and tells everyone, so the header and the top
    /// bar can never disagree about which of them is holding the arrows.
    compact = false,
    /// The colour of the place, as a NAME (services/accent.js) — the dot after
    /// the title. Only the compact header draws it: it is what tells a space
    /// apart at a glance once the sidebar is behind a drawer. It is drawn on
    /// EVERY screen, colour or not (user call, 2026-08-18): a fixed space
    /// carries no colour of its own and falls back to the app's accent in CSS,
    /// the same fallback the tab dot takes — a mark that comes and goes says
    /// less than one that is always there to be read.
    dot = null,
  } = $props();

  /// The stored choice as CSS — a name becomes the ground-aware `var()`, a raw
  /// hex passes through, and nothing at all leaves the property unset so the
  /// class's own fallback (the app's accent) applies.
  let dotStyle = $derived(dotStyleOf(dot));

  /// What the menu belongs to, so leaving the page closes it (PageMenu).
  let pageKey = $derived(title);
</script>

{#if compact && !title}
  <!-- A screen that names ITSELF asks for no name here (the open note, whose
       head carries the title on its banner — wireframes "Editor Screen mobile"
       and "New note mobile - no banner"). Nothing is drawn at all rather than
       an empty strip: the canvas has to start at the top of the screen for the
       banner to bleed into it. -->
{:else if compact}
  <header class="page-header page-header--compact" data-region="chrome">
    <div class="page-header__place">
      <h1 class="page-header__name-large">
        {#if onRenameTitle}
          <button
            class="page-header__name"
            title={S.promptRenameNote(title)}
            onclick={() => onRenameTitle()}
          >
            {title}
          </button>
        {:else}
          {title}
        {/if}
        <!-- The colour of the place (controls/marks.css). With the sidebar behind a
             drawer this dot is the only thing on screen still saying which
             space you are in. -->
        <span class="theme-dot" style={dotStyle} aria-hidden="true"></span>
      </h1>
    </div>
  </header>
{:else}
  <header class="page-header">
    <PageNav {canBack} {canForward} {onBack} {onForward} />

    <h1 class="page-header__heading">
      {#if onRenameTitle}
        <button
          class="page-header__name"
          title={S.promptRenameNote(title)}
          onclick={() => onRenameTitle()}
        >
          {title}
        </button>
      {:else}
        {title}
      {/if}
    </h1>

    <PageMenu items={menu} {pageKey} />
  </header>
{/if}
