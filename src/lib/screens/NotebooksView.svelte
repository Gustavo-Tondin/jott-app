<script>
  // The notebooks screen: the door of the app (wireframes "Notebooks screen"
  // and "Empity Notebooks screen", desktop and mobile, 2026-08-24).
  //
  // It replaced the onboarding paragraph that lived in App.svelte, which knew
  // one thing about the machine — that a folder had never been picked — and
  // said the same sentence forever after. Anyone with more than one notebook
  // had to find the folder again, every time, in the system's picker.
  //
  // WHAT IT DRAWS, AND WHY IT IS NOT A LIST OF PATHS. A notebook is a folder,
  // and a folder is a path — but nobody recognizes their own work by a path.
  // So every card carries the three things that DO identify it: the colour
  // chosen inside that notebook, what is still to do in there, and what came
  // into the Inbox and has not been filed. The path is one row down, in the ⋮,
  // where it settles the one question the card cannot: which of the two
  // notebooks called "Work" this is.
  //
  // TWO STATES, ONE SCREEN. With nothing remembered it is the empty wireframe
  // — the logo and the two choices, and no panel around an empty list. The
  // moment there is one notebook to offer, the panel appears above them. Not
  // two components: the difference is a list with nothing in it, and the app
  // would otherwise have two screens to keep in step for a state that lasts
  // one click.
  //
  // WHAT IT DOES NOT DO. It never opens a notebook to draw it — `recent_notebooks`
  // answers from `Notebook::summarize`, which reads and does not write, for the
  // reason that module's header gives. And it holds no notebook itself: every
  // action is handed up to the shell, which is the one place that knows what
  // having a notebook open means.
  import { api } from "../services/api.js";
  import { S } from "../services/strings.js";
  import { accentSolid, DEFAULT_ACCENT } from "../services/accent.js";
  import { timeSince } from "../services/dates.js";
  import { askConfirm, askName } from "../services/dialog.js";
  import Menu from "../components/Menu.svelte";
  import Icon from "../components/Icon.svelte";
  // The drawn logo, not a letter in the UI font — the same file the title bar
  // carries, authored white and rewritten to `fill: currentColor` so it takes
  // the ink of whatever theme is on.
  import wordmark from "../../assets/brand/wordmark.svg?raw";

  let {
    /// The build's version, under the logo. The full number, patch included:
    /// this is what someone copies into a bug report.
    version = "",
    /// `({ create }) => void` — one of the two doors at the bottom was used.
    /// Both ask the machine for a folder; `create` is what the folder is then
    /// allowed to be. The shell owns the action, because it ends in a notebook
    /// being open.
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
    /// `(count) => void` — how many notebooks the screen is offering, told to
    /// the shell after every read. The shell has one thing below this screen
    /// that depends on it (Android's private-folder offer), and asking the
    /// bridge a second time for the same list would be a second answer to keep
    /// in step.
    onListed,
    /// `() => void` — dismiss the screen, back to the notebook underneath.
    /// Null when there is nothing underneath, which is every window that
    /// opened ON this screen: the desktop's picker is a window of its own and
    /// is closed by closing it. Only the phone, which has one window and shows
    /// this over the open notebook, passes one.
    onClose = null,
    /// The narrow shell (shell/compact.js). The phone drops the "42 min ago"
    /// beside the name — there is no room for it next to a title, and the
    /// mobile wireframe does not draw it.
    compact = false,
    onError,
  } = $props();

  /// The two questions the screen's own ⋮ asks. Both are about WINDOWS —
  /// whether this one survives a choice, and which screen the app comes back
  /// to — so they hang off the screen and not off any one card, and both are
  /// machine preferences (`src-tauri/src/prefs.rs`).
  ///
  /// Read once on mount and kept here: a checkbox that has to re-read the
  /// bridge to know it was ticked flickers, and nothing else on this machine
  /// changes them while the screen is up.
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
      // The preferences ride along with the list: both are the machine's, and
      // the screen would otherwise paint its ⋮ from a default it has not
      // checked. Neither is a reason to fail the screen — the two doors work
      // without either — so a failure only reaches the banner.
      const [closes, here] = await Promise.all([api.pickerCloses(), api.opensOnPicker()]);
      // `??`, not `||`: a bridge that answers nothing (an older build without
      // these commands) must land on the DOCUMENTED defaults — the picker gets
      // out of the way, and the app comes back to the work — and `false` is a
      // real answer that must survive.
      closesAfterOpening = closes ?? true;
      opensHere = here ?? false;
      notebooks = (await api.recentNotebooks()) ?? [];
      onListed?.(notebooks.length);
    } catch (e) {
      // A picker that cannot read its own list still opens notebooks: the two
      // buttons are the part that never needed the list. So the failure is
      // reported and the screen carries on, rather than becoming an error page.
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

  /// What the ⋮ of one card offers.
  ///
  /// The path leads, as a row that cannot be chosen: it is not an action, it
  /// is the answer to "which one is this?" — and a card shows a folder's name,
  /// which two folders may share.
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
          // Asked, and asked in full: "remove" beside a notebook has to be
          // unambiguous about what it does NOT do. Not one of the questions
          // `confirmDeletes` can switch off — that setting lives in a
          // notebook, and this screen has none open to read it from.
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
  <!-- The logo is the screen's subject, so it is drawn here rather than in the
       title bar: with no notebook open the bar carries nothing but the window
       buttons, and the brand in two sizes at once read as a mistake. -->
  <header class="notebooks__brand">
    <span class="notebooks__wordmark" aria-hidden="true">{@html wordmark}</span>
    <p class="notebooks__version">{version}</p>

    <!-- The screen's own ⋮, in the corner rather than beside the logo: what it
         holds is about this WINDOW, and putting it next to the wordmark would
         read as a menu about Jott. -->
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
          <!-- The colour is written on the ROW, not on the button inside it:
               the ⋮ sits on the same surface and has to read on it too, and a
               colour set in two places is a colour that drifts.

               A notebook that never chose one falls back HERE rather than in
               the sheet, because the sheet's own fallback would have to be
               `--app-brand` — the region's accent, which in the chrome is a
               bright step meant to be read AS text, and white on it is not
               readable. `DEFAULT_ACCENT` is what the app ships as, solid. -->
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

  <!-- The two ways in. Side by side once there is a list above them, stacked
       when they are the whole screen — the wireframes draw both, and it is one
       row that wraps rather than two markups (notebooks.css). -->
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
