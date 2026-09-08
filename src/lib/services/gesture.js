// What a drag or a paste is carrying. `dataTransfer.files` is empty for a file
// dragged or copied from a file manager; a DRAG names it in `text/html`, a
// PASTE names it nowhere (the system clipboard is read in Rust). READ BEFORE
// YOU AWAIT: once the event finishes dispatching the `DataTransfer` answers
// as empty, in silence. See docs/platform-gotchas.md#webview-e-gestos

import { api } from "./api.js";

/// Whether a gesture is worth taking over, from its TYPES alone — all that is
/// readable during a `dragover`. A copied IMAGE offers `text/html` and nothing
/// else; copied TEXT always brings `text/plain` along — without that check a
/// pasted paragraph would be claimed as a file and swallowed.
export function looksLikeFiles(transfer) {
  const types = Array.from(transfer?.types ?? []);
  if (types.includes("Files") || types.includes("text/uri-list")) return true;
  return types.includes("text/html") && !types.includes("text/plain");
}

/// The files a `<input type="file">` was given, taken safely. The reset MUST
/// come after the copy: WebKit's `input.value = ""` clears the very `FileList`
/// the caller holds (Blink hands out a fresh one, which is why jsdom passes).
/// See docs/platform-gotchas.md#webview-e-gestos
export function filesFromInput(input) {
  const files = Array.from(input?.files ?? []);
  if (input) input.value = "";
  return files;
}

/// Everything a gesture brought, as `{files, paths, remote, types}`: bytes in
/// hand, files of THIS machine, a web address (the shell asks first).
/// `clipboard: true` allows asking the system clipboard (only a paste has one).
/// MUST be called synchronously from the handler, which `preventDefault()`s first.
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

/// The local files named anywhere in a blob of text, deduplicated. One scan
/// for both flavours (uri-list: one address per line; html: an `<a>` with the
/// address as its text) — stopping at quotes, angle brackets and whitespace.
export function localPathsIn(text) {
  const found = String(text ?? "").match(/file:\/\/[^\s"'<>]+/g) ?? [];
  const seen = new Set();
  return found
    .map(pathOfFileUrl)
    .filter((path) => path && !seen.has(path) && seen.add(path));
}

/// The picture a web page put on the clipboard, or `""`. An `<img src>` and
/// nothing else: any loose https address would turn a copied paragraph into
/// an offer to download whatever it linked to.
export function remoteImageIn(markup) {
  const tag = String(markup ?? "").match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  const url = tag?.[1] ?? "";
  return url.startsWith("https://") ? url : "";
}
