<script>
  // The notebooks screen: the door of the app. A card carries what identifies
  // a notebook — its colour, what is to do, what sits in the Inbox — and the
  // path is in the ⋮. With nothing remembered it is the empty state (no panel
  // around an empty list). It never opens a notebook to draw it
  // (`recent_notebooks` reads via `Notebook::summarize`) and holds none itself.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { accentSolid, DEFAULT_ACCENT } from "../services/accent.js";
  import { timeSince } from "../services/dates.js";
  import { askConfirm, askName } from "../services/dialog.js";
  import Menu from "../components/Menu.svelte";
  import Icon from "../components/Icon.svelte";
  // The drawn logo, the same file the title bar carries, rewritten to
  // `fill: currentColor` so it takes the theme's ink.
  import wordmark from "../../assets/brand/wordmark.svg?raw";

  let {
    /// The build's version, under the logo. The full number, patch included:
    /// this is what someone copies into a bug report.
    version = "",
    /// `({ create }) => void` — one of the two doors at the bottom was used.
    /// Both ask the machine for a folder; `create` is what the folder is then
    /// allowed to be. The shell owns the action.
    onChoose,
    /// `(path) => void` — a card was clicked.
    onOpen,
    /// `() => Promise<string|null>` — asks the machine for a folder and
    /// answers with its path. Only the Move row uses it, and only the shell
    /// knows how to ask on this platform (a system picker on the desktop, the
    /// app's own browser on Android).
    onPickFolder,
    /// Whether the shell is busy opening something, so the screen stops
    /// offering to open a second one.
    busy = false,
    /// `(count) => void` — how many notebooks the screen offers, told after
    /// every read: Android's private-folder offer depends on it, and asking
    /// the bridge again would be a second answer to keep in step.
    onListed,
    /// `() => void` — dismiss the screen, back to the notebook underneath.
    /// Null when there is nothing underneath (the desktop's picker is a window
    /// of its own); only the phone, showing this over the open notebook, passes one.
    onClose = null,
    /// The narrow shell (shell/compact.js): the phone drops the "42 min ago"
    /// beside the name.
    compact = false,
    onError,
  } = $props();

  /// The two questions the screen's own ⋮ asks. Both are about WINDOWS —
  /// whether this one survives a choice, and which screen the app comes back
  /// to — so they hang off the screen, not a card; both are machine preferences
  /// (`src-tauri/src/prefs.rs`). Read once on mount: nothing else changes them.
  let closesAfterOpening = $state(true);
  let opensHere = $state(false);

  /// The cards, newest first. Empty until the first read answers, which is why
  /// the empty state is not drawn from `notebooks.length` alone — see below.
  let notebooks = $state([]);
  /// Whether the list has ever been read. The screen paints before the bridge
  /// answers, and without this the two choices would land in the middle of the
  /// window (the empty state) and then jump to the bottom a frame later.
  let read = $state(false);

  $effect(() => {
    load();
  });

  async function load() {
    try {
      // The preferences ride along with the list: both are the machine's.
      // Neither is a reason to fail the screen — the two doors work without
      // either — so a failure only reaches the banner.
      const [closes, here] = await Promise.all([api.pickerCloses(), api.opensOnPicker()]);
      // `??`, not `||`: a bridge that answers nothing (an older build) must
      // land on the DOCUMENTED defaults, and `false` is a real answer that
      // must survive.
      closesAfterOpening = closes ?? true;
      opensHere = here ?? false;
      notebooks = (await api.recentNotebooks()) ?? [];
      onListed?.(notebooks.length);
    } catch (e) {
      // A picker that cannot read its list still opens notebooks (the two
      // buttons never needed it): report, and carry on.
      onError?.(e);
    } finally {
      read = true;
    }
  }

  /// Runs an action on a notebook and re-reads the list. Every row of the ⋮
  /// takes this shape — the card's numbers, its name and its place in the
  /// order are all answers the bridge has to give again afterwards.
  async function act(run) {
    try {
      await run();
      await load();
    } catch (e) {
      onError?.(e);
    }
  }

  /// What the screen's own ⋮ offers: the two window questions, and — on the
  /// phone, where this is shown over an open notebook rather than in a window
  /// of its own — the way back.
  let screenMenu = $derived([
    {
      label: S.keepPickerOpen,
      checked: !closesAfterOpening,
      run: () =>
        act(async () => {
          closesAfterOpening = !closesAfterOpening;
          await api.rememberPickerCloses(closesAfterOpening);
        }),
    },
    {
      label: S.openAppOnPicker,
      checked: opensHere,
      run: () =>
        act(async () => {
          opensHere = !opensHere;
          await api.rememberOpensOnPicker(opensHere);
        }),
    },
    ...(onClose ? [{ label: S.closeNotebooks, run: () => onClose() }] : []),
  ]);

  /// What the ⋮ of one card offers. The path leads, as a row that cannot be
  /// chosen: it is the answer to "which one is this?" — two folders may share
  /// a name.
  const menuFor = (entry) => [
    { label: entry.path, disabled: true },
    {
      label: S.renameNotebook,
      run: () =>
        act(async () => {
          const name = await askName(S.renameNotebookPrompt, entry.name);
          if (!name || name === entry.name) return;
          await api.renameNotebook(entry.path, name);
        }),
    },
    {
      label: S.moveNotebook,
      run: () =>
        act(async () => {
          const into = await onPickFolder?.();
          if (!into) return;
          await api.moveNotebook(entry.path, into);
        }),
    },
    { label: S.revealNotebook, run: () => act(() => api.revealNotebook(entry.path)) },
    {
      label: S.forgetNotebook,
      run: () =>
        act(async () => {
          // Asked in full: "remove" beside a notebook has to be unambiguous
          // about what it does NOT do. Not one of the questions `confirmDeletes`
          // can switch off — that setting lives in a notebook, and none is open here.
          const sure = await askConfirm(S.confirmForget(entry.name), {
            detail: S.confirmForgetDetail,
            code: entry.path,
            danger: S.forgetNotebook,
          });
          if (!sure) return;
          await api.forgetNotebook(entry.path);
        }),
    },
  ];
</script>

<section class="notebooks" class:notebooks--empty={read && notebooks.length === 0}>
  <!-- The logo is the screen's subject, so it is drawn here, not in the title
       bar: with no notebook open the bar carries only the window buttons. -->
  <header class="notebooks__brand">
    <span class="notebooks__wordmark" aria-hidden="true">{@html wordmark}</span>
    <p class="notebooks__version">{version}</p>

    <!-- The screen's own ⋮, in the corner: what it holds is about this WINDOW,
         and beside the wordmark it would read as a menu about Jott. -->
    <div class="notebooks__screen-menu">
      <Menu items={screenMenu} align="end">
        {#snippet trigger({ toggle })}
          <button
            class="theme-btn--icon"
            onclick={toggle}
            aria-label={S.notebooksOptions}
            title={S.notebooksOptions}
          >
            <Icon name="dots-three-vertical" size="1rem" />
          </button>
        {/snippet}
      </Menu>
    </div>
  </header>

  {#if notebooks.length > 0}
    <div class="notebooks__panel">
      <h2 class="notebooks__heading">{S.pickANotebook}</h2>
      <ul class="notebooks__list">
        {#each notebooks as entry (entry.path)}
          {@const when = compact ? null : timeSince(entry.opened)}
          <!-- The colour is written on the ROW, not the button: the ⋮ sits on the
               same surface and reads it too. A notebook that never chose one
               falls back HERE, not in the sheet: the sheet's fallback would be
               `--app-brand`, a bright step in the chrome that white cannot read on. -->
          <li
            class="notebooks__item"
            style="--notebook-color: {accentSolid(entry.accentColor || DEFAULT_ACCENT)}"
          >
            <button
              class="notebooks__card"
              onclick={() => onOpen?.(entry.path)}
              disabled={busy}
            >
              <span class="notebooks__line">
                <span class="notebooks__name">{entry.name}</span>
                {#if when}<span class="notebooks__when">{S.ago(when)}</span>{/if}
                {#if entry.readOnly}
                  <span class="notebooks__when">{S.notebookReadOnly}</span>
                {/if}
              </span>
              <span class="notebooks__counts">
                {S.notebookCounts(entry.notes, entry.tasks)}
              </span>
            </button>

            <Menu items={menuFor(entry)} align="end">
              {#snippet trigger({ toggle })}
                <button
                  class="theme-btn--icon notebooks__menu"
                  onclick={toggle}
                  aria-label={S.notebookOptions}
                  title={S.notebookOptions}
                >
                  <Icon name="dots-three-vertical" size="1rem" />
                </button>
              {/snippet}
            </Menu>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- The two ways in: side by side once there is a list above them, stacked
       when they are the whole screen — one row that wraps (notebooks.css). -->
  <div class="notebooks__actions">
    <button
      class="theme-btn theme-btn--primary notebooks__action"
      onclick={() => onChoose?.({ create: true })}
      disabled={busy}
    >
      <span>{S.createNotebook}</span>
      <Icon name="plus" size="1.25rem" />
    </button>
    <button
      class="theme-btn notebooks__action notebooks__action--alt"
      onclick={() => onChoose?.({ create: false })}
      disabled={busy}
    >
      <span>{S.openNotebook}</span>
      <Icon name="folder-plus" size="1.25rem" />
    </button>
  </div>
</section>
