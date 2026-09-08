<script module>
  import { S } from "../../services/strings.js";

  /// The rows the settings search can find on this page.
  export const index = () => [
    S.updateVersion,
    S.updateCheckNow,
    S.updateAutoCheck,
    S.closeToTray,
    S.autostart,
    S.menuEntryLabel,
    S.yourFiles,
    S.reportIssue,
    S.quitApp,
  ];
</script>

<script>
  // About: the version, this install's own switches (updates, tray, session
  // start, the menu entry) and the doors out. Machine preferences, not
  // notebook ones — none of it goes through the notebook or minds `readOnly`.
  import { untrack } from "svelte";
  import { api } from "../../services/api.js";
  import { openExternal, ISSUES_URL } from "../../services/external.js";
  import { installUpdate, manualCheck, openReleasePage } from "../../services/update.js";
  import { addToMenu, removeFromMenu } from "../../services/desktopEntry.js";
  import HelpTip from "./HelpTip.svelte";
  import SettingsSection from "./SettingsSection.svelte";

  let {
    compact = false,
    /// Android (shell/platform.js): no tray and no session to start with, so
    /// the two rows about them are not drawn.
    mobile = false,
    onError,
  } = $props();

  // Machine preferences: the same notebook synced to a phone and a desktop
  // is served by two binaries, each updated its own way.
  let version = $state("");
  let updateAuto = $state(true);
  let checking = $state(false);
  let installing = $state(false);
  /// The answer to the last click on "Check now" — null until one happens.
  let checked = $state(null);

  api.appVersion().then((v) => (version = v ?? "")).catch(() => {});
  api.autoUpdateCheck().then((on) => (updateAuto = on ?? true)).catch(() => {});

  // The tray and the session start — this INSTALL's, like the update switch.
  let closeToTray = $state(true);
  let autostart = $state(false);
  // Read once, on purpose: the platform does not change under a running app.
  if (!untrack(() => mobile)) {
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
  /// false (a packaged Jott, Windows, Android) hides the row: the package
  /// manager already put this app in the menu.
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

  /// The `.jott` folder, where the notebook documents its own format: the
  /// command opens the FOLDER around an address (`commands::folder_to_open`).
  const openFormatDoc = () =>
    api.openInFileManager(".jott/_FORMAT.txt").catch(onError);
</script>

<SettingsSection title={S.sectionAbout} {compact}>
  <h3 class="settings__subtitle">{S.subVersion}</h3>

  <!-- The number and the button that asks about it, on one line. -->
  <div class="settings__row">
    <span class="settings__label">{S.updateVersion}</span>
    <span class="settings__row-end">
      <code class="settings__path">Jott {version}</code>
      <button
        type="button"
        class="theme-btn theme-btn--outline theme-btn--xs"
        disabled={checking}
        onclick={checkNow}>{checking ? S.updateChecking : S.updateCheckNow}</button
      >
    </span>
  </div>

  <label class="settings__row">
    <span class="settings__label">
      {S.updateAutoCheck}
      <HelpTip label={S.updateAutoCheck} text={S.updateAutoCheckHint} />
    </span>
    <input
      class="theme-switch"
      type="checkbox"
      checked={updateAuto}
      aria-label={S.updateAutoCheck}
      onchange={(e) => setUpdateAuto(e.currentTarget.checked)}
    />
  </label>

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

  {#if !mobile}
    <h3 class="settings__subtitle">{S.subSystem}</h3>

    <label class="settings__row">
      <span class="settings__label">
        {S.closeToTray}
        <HelpTip label={S.closeToTray} text={S.closeToTrayHint} />
      </span>
      <input
        class="theme-switch"
        type="checkbox"
        checked={closeToTray}
        aria-label={S.closeToTray}
        onchange={(e) => setCloseToTray(e.currentTarget.checked)}
      />
    </label>

    <label class="settings__row">
      <span class="settings__label">
        {S.autostart}
        <HelpTip label={S.autostart} text={S.autostartHint} />
      </span>
      <input
        class="theme-switch"
        type="checkbox"
        checked={autostart}
        aria-label={S.autostart}
        onchange={(e) => setAutostart(e.currentTarget.checked)}
      />
    </label>

    <!-- Only an AppImage sees this: a single file installs nothing, so there
         is no entry to find it by; a deb/rpm/pacman Jott was put in the menu at
         install time and must not get a second one. -->
    {#if menuEntry.supported}
      <label class="settings__row">
        <span class="settings__label">
          {S.menuEntryLabel}
          <HelpTip label={S.menuEntryLabel} text={S.menuEntryHint} />
        </span>
        <input
          class="theme-switch"
          type="checkbox"
          checked={menuEntry.installed}
          disabled={menuBusy}
          aria-label={S.menuEntryLabel}
          onchange={(e) => setMenuEntry(e.currentTarget.checked)}
        />
      </label>
    {/if}
  {/if}

  <h3 class="settings__subtitle">{S.subHelp}</h3>

  <!-- Principle 4 said out loud: every notebook documents its own format in
       plain text, and this points at the file. -->
  <div class="settings__row">
    <span class="settings__label">
      {S.yourFiles}
      <HelpTip label={S.yourFiles} text={S.yourFilesHint} />
    </span>
    <button
      type="button"
      class="theme-btn theme-btn--outline theme-btn--xs"
      onclick={openFormatDoc}>{S.yourFilesAction}</button
    >
  </div>

  <div class="settings__row">
    <span class="settings__label">{S.reportIssue}</span>
    <button
      type="button"
      class="theme-btn theme-btn--outline theme-btn--xs"
      onclick={() => openExternal(ISSUES_URL).catch(onError)}
      >{S.reportIssueAction}</button
    >
  </div>

  <!-- Last, past a rule: the one row that ends the session. -->
  {#if !mobile}
    <div class="settings__row settings__row--last">
      <span class="settings__label">{S.quitApp}</span>
      <button class="theme-btn" type="button" onclick={() => api.quitApp()}>
        {S.quitApp}
      </button>
    </div>
  {/if}
</SettingsSection>
