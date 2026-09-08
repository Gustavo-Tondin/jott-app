// Knowing when a newer Jott exists. The check is Rust's (`check_for_update`,
// one GET for `latest.json`); this owns the POLICY: when the automatic check
// is due, what silence means, and which ending applies (`canInstall`) —
// installs that can replace themselves hand over to the updater plugin, which
// verifies against the baked-in public key; the rest get the release page.

import { api } from "./api.js";
import { openExternal } from "./external.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/// Whether the daily look at the release feed is due. Absent or unreadable
/// means it never ran — due.
export function isDue(lastIso, now = new Date()) {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= DAY_MS;
}

/// The launch-time check. Resolves to the bridge's answer when there IS a
/// newer version, and to `null` in every other case — switched off, not due
/// yet, up to date, or offline. Silent on purpose: an offline launch is a
/// normal launch, and "no update" is not news.
export async function autoCheck(now = new Date()) {
  if (!(await api.autoUpdateCheck())) return null;
  if (!isDue(await api.lastUpdateCheck(), now)) return null;

  // The ATTEMPT is what is stamped, not the success — a machine that is
  // offline every morning must not grow a request on every launch.
  await api.rememberLastUpdateCheck(now.toISOString());

  try {
    const found = await api.checkForUpdate();
    return found?.newer ? found : null;
  } catch {
    return null;
  }
}

/// The settings screen's button. No policy here — the click was the consent,
/// and the error is the caller's to show.
export function manualCheck() {
  return api.checkForUpdate();
}

/// Downloads and installs in place, then relaunches. Only meaningful where
/// the bridge said `canInstall`; the plugins are imported lazily so the
/// mobile bundle never touches commands that were not compiled into it.
export async function installUpdate() {
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");

  // The plugin re-reads the manifest itself: it is the one that verifies the
  // signature, so it does not take our word for what is out there.
  const update = await check();
  if (!update) return false;
  await update.downloadAndInstall();
  await relaunch();
  return true;
}

/// The other ending: the release page in the system browser, through the
/// one door every outward link uses (`services/external.js`).
export async function openReleasePage(url) {
  await openExternal(url);
}
