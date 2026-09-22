// Which language the interface speaks, and how a dictionary is laid over
// `S`. The machine's preference and the system's locale are resolved by the
// bridge (`prefs::lang`): the tray and the reminder thread read the same
// answer, so the three never disagree.

import { S } from "./strings.js";
import { api } from "./api.js";
import { LANGUAGES, same } from "../locales/index.js";

export { LANGUAGES };

/// What the user picked: `system` or a tag. Read once, at boot, for the
/// Settings row.
export let chosen = "system";

/// Lays a dictionary over S. A string or table only replaces its English
/// while the pair's English is still what S says, so a changed source falls
/// back to English on its own; a function is trusted (built source is not
/// comparable) — its staleness is the test's job (locale.test.js).
export function apply(dict) {
  for (const [key, pair] of Object.entries(dict)) {
    if (!(key in S) || !Array.isArray(pair) || pair.length !== 2) continue;
    const [en, translation] = pair;
    const fits = typeof en === "function" ? typeof S[key] === "function" : same(en, S[key]);
    if (fits) S[key] = translation;
  }
}

/// Before the first paint: asks the bridge which language this machine
/// speaks, loads it, and tells the document (hyphenation follows `lang`).
/// Outside Tauri, or on any failure, S stays English — nothing here may
/// stop the app from opening.
export async function boot() {
  try {
    const { chosen: picked, effective } = await api.language();
    chosen = picked;
    document.documentElement.lang = effective;
    const load = LANGUAGES[effective]?.load;
    if (load) apply((await load()).default);
    return effective;
  } catch {
    return "en";
  }
}

/// Reloads the window so the new language is read. Sent to the notebook it
/// shows (the address `shell/entry.js` reads), not just reloaded: the first
/// window has no address of its own and would come back on whatever the
/// machine opens on — the picker, for whoever chose that.
export function reloadIn(notebookPath) {
  if (notebookPath) location.assign(`?notebook=${encodeURIComponent(notebookPath)}`);
  else location.reload();
}
