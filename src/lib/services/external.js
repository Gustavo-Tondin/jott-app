// Opening an address OUTSIDE the app — the system browser, not a webview.
//
// One door, because every one of these is a connection the user is entitled to
// see coming (principle 9): the release page, the issue tracker, and whatever
// link the About page grows next. The plugin is imported lazily so the mobile
// bundle never touches a command that was not compiled into it — the same pact
// `services/update.js` keeps with the updater.

/// Opens `url` in whatever the system uses for links. Anything that is not an
/// http(s) address is refused here rather than handed to the platform: this is
/// the one function in the app that can make the OS act on a string, and the
/// strings it takes are ours.
export async function openExternal(url) {
  if (!/^https?:\/\//i.test(String(url ?? ""))) return false;
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
  return true;
}

/// Where an issue about Jott goes. A constant rather than a setting: it is the
/// project's own address, and it changes when the repository moves.
export const ISSUES_URL = "https://github.com/Gustavo-Tondin/jott-app/issues";
