// What a drag or a paste is carrying.
//
// One question, one function — and every hard-won fact about it is written
// down here rather than spread through the components that ask. All of it was
// MEASURED inside the running app (2026-08-19), by logging the real gesture
// from the capture phase; none of it can be read off the specification alone.
//
//   1. **`dataTransfer.files` is almost always empty.** It holds bytes only
//      for `<input type="file">` and for an IMAGE pasted from a viewer. A file
//      dragged or copied out of a file manager has none.
//   2. **A DRAG names the file in the `text/html` flavour**, of all places:
//      `<a …>file:///home/gus/foto.webp</a>`, while `text/uri-list` sits there
//      empty beside it.
//   3. **A PASTE names it nowhere at all** — `getData` and `getAsString` both
//      answer `""` for every type. The system clipboard has the answer, and it
//      is read in Rust (`clipboard_files`).
//   4. **A picture copied from a WEB PAGE** is `text/html` holding an
//      `<img src="https://…">`, and nothing local anywhere.
//
// **The one rule that binds all of it: read before you await.** When an event
// finishes dispatching, the clipboard store goes to Protected mode and the
// `DataTransfer` is disconnected — from then on it answers as if it were empty
// (W3C Clipboard API). So everything this module needs is taken, or at least
// started, synchronously; only then does it await. Getting that wrong is
// silent, and it is what made the paste do nothing for three rounds.

import { api } from "./api.js";

/// Whether a gesture is worth taking over, from its TYPES alone — which is
/// all that is readable during a `dragover`, and the only thing that can be
/// decided before the reading begins.
///
/// The second half is the measured discriminator between a picture copied
/// from a page and ordinary rich text: a copied IMAGE offers `text/html` and
/// nothing else, while copied TEXT always brings `text/plain` along. Without
/// it, pasting a paragraph off a web page would be claimed as a file and
/// swallowed.
export function looksLikeFiles(transfer) {
  const types = Array.from(transfer?.types ?? []);
  if (types.includes("Files") || types.includes("text/uri-list")) return true;
  return types.includes("text/html") && !types.includes("text/plain");
}

/// The files a `<input type="file">` was given, taken safely.
///
/// **The reset has to come after the copy.** In WebKit — the app's webview on
/// Linux — `input.value = ""` clears the very `FileList` object the caller is
/// holding (`FileInputType::setValue` calls `m_fileList->clear()`), so reading
/// `files.length` afterwards answers 0 and the import silently does nothing.
/// Blink hands out a fresh empty list instead, which is why every Chromium
/// harness and jsdom saw the old order work.
///
/// The input is reset so the same picture can be picked twice in a row after
/// a mistake.
export function filesFromInput(input) {
  const files = Array.from(input?.files ?? []);
  if (input) input.value = "";
  return files;
}

/// Everything a gesture brought, as `{files, paths, remote, types}`.
///
/// `files` are bytes already in hand, `paths` are files of THIS machine, and
/// `remote` is an address on the web — kept apart because the last one is a
/// request to make rather than a file to copy, and the shell asks first.
///
/// `clipboard: true` allows the last resort, which only a paste has: asking
/// the system what is on its clipboard. A drop has no such thing to ask.
///
/// **Must be called synchronously from the event handler**, which must
/// `preventDefault()` before awaiting the result — see the module header.
export function readGesture(transfer, { clipboard = false } = {}) {
  const types = Array.from(transfer?.types ?? []);
  const files = Array.from(transfer?.files ?? []);
  const written = ["text/uri-list", "URL", "text/plain"]
    .map((type) => getData(transfer, type))
    .join("\n");
  // Started NOW, callbacks and all: the item list is unreadable a tick later.
  const strings = Array.from(transfer?.items ?? [])
    .filter((item) => item.kind === "string")
    .map(asString);

  const found = (extra) => ({ files: [], paths: [], remote: "", types, ...extra });

  if (files.length) return Promise.resolve(found({ files }));
  const written_paths = localPathsIn(written);
  if (written_paths.length) return Promise.resolve(found({ paths: written_paths }));

  return Promise.all(strings).then(async (values) => {
    const text = values.join("\n");
    const paths = localPathsIn(text);
    if (paths.length) return found({ paths });

    const remote = remoteImageIn(text);
    if (remote) return found({ remote });

    if (!clipboard) return found({});
    return found({ paths: (await systemClipboard()).map(pathOfFileUrl).filter(Boolean) });
  });
}

function getData(transfer, type) {
  try {
    return String(transfer?.getData?.(type) ?? "");
  } catch {
    return "";
  }
}

/// One string item, read through its callback — with a deadline, because a
/// callback that never fires must not hang the gesture.
function asString(item) {
  return new Promise((resolve) => {
    let answered = false;
    const settle = (value) => {
      if (answered) return;
      answered = true;
      resolve(String(value ?? ""));
    };
    try {
      item.getAsString(settle);
    } catch {
      settle("");
    }
    setTimeout(() => settle(""), 250);
  });
}

const systemClipboard = () => api.clipboardFiles().then((uris) => uris ?? []).catch(() => []);

/// The path a `file://` address names on this machine, or `""`.
///
/// Percent-decoded, because a desktop escapes what a URL has to escape and a
/// photo called `férias 2026.jpg` arrives as `f%C3%A9rias%202026.jpg`.
export function pathOfFileUrl(url) {
  const text = String(url ?? "").trim();
  if (!text.toLowerCase().startsWith("file://")) return "";
  // `file://host/path` — the host is empty for a local file, which is every
  // file a desktop hands over.
  const rest = text.slice("file://".length);
  const slash = rest.indexOf("/");
  if (slash < 0) return "";
  try {
    return decodeURIComponent(rest.slice(slash));
  } catch {
    return rest.slice(slash);
  }
}

/// The local files named anywhere in a blob of text, deduplicated.
///
/// One scan for both flavours: a uri-list is one address per line, and the
/// html flavour is a whole `<a>` with the address as its text. Stopping at the
/// delimiters an address cannot contain once written into either — quotes,
/// angle brackets, whitespace — finds it in both.
export function localPathsIn(text) {
  const found = String(text ?? "").match(/file:\/\/[^\s"'<>]+/g) ?? [];
  const seen = new Set();
  return found
    .map(pathOfFileUrl)
    .filter((path) => path && !seen.has(path) && seen.add(path));
}

/// The picture a web page put on the clipboard, or `""`.
///
/// An `<img src>` and nothing else, deliberately: any https address found
/// loose in markup would turn a copied paragraph into an offer to download
/// whatever it happened to link to.
export function remoteImageIn(markup) {
  const tag = String(markup ?? "").match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  const url = tag?.[1] ?? "";
  return url.startsWith("https://") ? url : "";
}
