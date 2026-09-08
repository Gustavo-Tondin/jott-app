<script module>
  import { S } from "../../services/strings.js";

  /// The rows the settings search can find on this page.
  export const index = () => [
    S.updateVersion,
    S.updateAutoCheck,
    S.closeToTray,
    S.autostart,
    S.quitApp,
    S.updateCheckNow,
    S.yourFiles,
    S.menuEntryLabel,
    S.reportIssue,
  ];
</script>

<script>
  // About: the version, this install's own switches (updates, tray, session
  // start, the menu entry) and the doors out. Machine preferences, not
  // notebook ones — none of it goes through the notebook or minds `readOnly`.
  import { api } from "../../services/api.js";
  import { openExternal, ISSUES_URL } from "../../services/external.js";
  import { installUpdate, manualCheck, openReleasePage } from "../../services/update.js";
  import { addToMenu, removeFromMenu } from "../../services/desktopEntry.js";
  import SettingsSection from "./SettingsSection.svelte";

  let {
    compact = false,
    /// Android (shell/platform.js): no tray and no session to start with, so
    /// the two rows about them are not drawn — a switch that cannot do
    /// anything is worse than none.
    mobile = false,
    onError,
  } = $props();

  // ---- updates (2026-08-19) ----
  // Machine preferences, not notebook ones: the same notebook synced to a
  // phone and a desktop is served by two binaries, each updated its own way.
  // That is why none of this goes through `put` or minds `readOnly`.
  let version = $state("");
  let updateAuto = $state(true);
  let checking = $state(false);
  let installing = $state(false);
  /// The answer to the last click on "Check now" — null until one happens.
  let checked = $state(null);

  api.appVersion().then((v) => (version = v ?? "")).catch(() => {});
  api.autoUpdateCheck().then((on) => (updateAuto = on ?? true)).catch(() => {});

  // The tray and the session start (2026-08-25) — this INSTALL's, like the
  // update switch, and read the same way.
  let closeToTray = $state(true);
  let autostart = $state(false);
  if (!mobile) {
    api.closeToTray().then((on) => (closeToTray = on ?? true)).catch(() => {});
    api.autostart().then((on) => (autostart = !!on)).catch(() => {});
  }
  const setCloseToTray = (on) => {
    closeToTray = on;
    api.rememberCloseToTray(on).catch(onError);
  };
  const setAutostart = (on) => {
    autostart = on;
    api.setAutostart(on).catch((e) => {
      autostart = !on;
      onError?.(e);
    });
  };

  const setUpdateAuto = (on) => {
    updateAuto = on;
    api.rememberAutoUpdateCheck(on).catch(onError);
  };

  /// The menu entry, on the installs that have one to write. `supported`
  /// false — a packaged Jott, Windows, Android — hides the row entirely
  /// rather than showing a switch that would refuse: the package manager
  /// already put this app in the menu.
  let menuEntry = $state({ supported: false, installed: false });
  let menuBusy = $state(false);

  api
    .desktopEntryState()
    .then((state) => (menuEntry = state ?? menuEntry))
    .catch(() => {});

  async function setMenuEntry(on) {
    menuBusy = true;
    try {
      await (on ? addToMenu() : removeFromMenu());
      menuEntry = { ...menuEntry, installed: on };
    } catch (e) {
      onError?.(e);
    } finally {
      menuBusy = false;
    }
  }

  async function checkNow() {
    checking = true;
    checked = null;
    try {
      checked = await manualCheck();
    } catch (e) {
      onError?.(e);
    } finally {
      checking = false;
    }
  }

  async function installNow() {
    installing = true;
    try {
      await installUpdate();
    } catch (e) {
      onError?.(e);
    } finally {
      installing = false;
    }
  }

  /// The `.jott` folder, where the notebook documents its own format. The
  /// command opens the FOLDER around an address, so naming the file is how
  /// you ask for the folder that holds it (`commands::folder_to_open`).
  const openFormatDoc = () =>
    api.openInFileManager(".jott/_FORMAT.txt").catch(onError);
</script>

<SettingsSection title={S.sectionAbout} {compact}>
  <h3 class="settings__subtitle">{S.subVersion}</h3>

  <p class="settings__row">
    <span class="settings__label">{S.updateVersion}</span>
    <code class="settings__path">Jott {version}</code>
  </p>

  <label class="settings__row">
    <span class="settings__label">{S.updateAutoCheck}</span>
    <input
      class="theme-switch"
      type="checkbox"
      checked={updateAuto}
      aria-label={S.updateAutoCheck}
      onchange={(e) => setUpdateAuto(e.currentTarget.checked)}
    />
  </label>
  <p class="settings__hint">{S.updateAutoCheckHint}</p>

  {#if !mobile}
    <label class="settings__row">
      <span class="settings__label">{S.closeToTray}</span>
      <input
        class="theme-switch"
        type="checkbox"
        checked={closeToTray}
        aria-label={S.closeToTray}
        onchange={(e) => setCloseToTray(e.currentTarget.checked)}
      />
    </label>
    <p class="settings__hint">{S.closeToTrayHint}</p>

    <label class="settings__row">
      <span class="settings__label">{S.autostart}</span>
      <input
        class="theme-switch"
        type="checkbox"
        checked={autostart}
        aria-label={S.autostart}
        onchange={(e) => setAutostart(e.currentTarget.checked)}
      />
    </label>
    <p class="settings__hint">{S.autostartHint}</p>

    <div class="settings__row">
      <span class="settings__label">{S.quitApp}</span>
      <button class="theme-btn" type="button" onclick={() => api.quitApp()}>
        {S.quitApp}
      </button>
    </div>
  {/if}

  <div class="settings__row">
    <span class="settings__label">{S.updateCheckNow}</span>
    <button
      type="button"
      class="theme-btn theme-btn--outline theme-btn--xs"
      disabled={checking}
      onclick={checkNow}>{checking ? S.updateChecking : S.updateCheckNow}</button
    >
  </div>
  {#if checked}
    <p class="settings__notice">
      {#if checked.newer}
        {S.updateAvailable(checked.latest)}
        {#if checked.canInstall}
          <button
            type="button"
            class="theme-btn theme-btn--primary theme-btn--xs"
            disabled={installing}
            onclick={installNow}
            >{installing ? S.updateInstalling : S.updateInstall}</button
          >
        {:else}
          <button
            type="button"
            class="theme-btn theme-btn--primary theme-btn--xs"
            onclick={() => openReleasePage(checked.url).catch(onError)}
            >{S.updateDownload}</button
          >
        {/if}
      {:else}
        {S.updateUpToDate}
      {/if}
    </p>
  {/if}

  <h3 class="settings__subtitle">{S.subThisApp}</h3>

  <!-- Principle 4 said out loud: every notebook documents its own
       format in plain text, and until now the app never pointed at the
       file that does it. -->
  <div class="settings__row">
    <span class="settings__label">{S.yourFiles}</span>
    <button
      type="button"
      class="theme-btn theme-btn--outline theme-btn--xs"
      onclick={openFormatDoc}>{S.yourFilesAction}</button
    >
  </div>
  <p class="settings__hint">{S.yourFilesHint}</p>

  <!-- Only an AppImage sees this. A single file installs nothing, so
       the desktop has no entry and no icon to find it by; a
       deb/rpm/pacman Jott was put in the menu at install time and
       must not get a second one. Reversible because it writes two
       files outside the notebook. -->
  {#if menuEntry.supported}
    <label class="settings__row">
      <span class="settings__label">{S.menuEntryLabel}</span>
      <input
        class="theme-switch"
        type="checkbox"
        checked={menuEntry.installed}
        disabled={menuBusy}
        aria-label={S.menuEntryLabel}
        onchange={(e) => setMenuEntry(e.currentTarget.checked)}
      />
    </label>
    <p class="settings__hint">{S.menuEntryHint}</p>
  {/if}

  <div class="settings__row">
    <span class="settings__label">{S.reportIssue}</span>
    <button
      type="button"
      class="theme-btn theme-btn--outline theme-btn--xs"
      onclick={() => openExternal(ISSUES_URL).catch(onError)}
      >{S.reportIssueAction}</button
    >
  </div>
</SettingsSection>
