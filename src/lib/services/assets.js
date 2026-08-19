// The notebook's image library, on this side of the bridge.
//
// An asset ADDRESS is what a note carries — `assets/sunset.jpg`, relative to
// the notebook's root wherever the note lives (user call, 2026-08-18; the core
// keeps the same rule in `core/src/assets.rs`). This file answers the one
// question the interface has about one: what do I put in `<img src>`?
//
// The answer is not a command. An `<img>` cannot call `invoke`, and a board of
// twenty banners would be twenty round trips of base64 — so the image is
// loaded by URL, through Tauri's asset protocol, which streams the file and
// lets the webview cache it. The protocol answers only for paths in its scope,
// and the scope is filled at runtime with the open notebook's `assets/` folder
// and nothing else (`commands::allow_assets`).

import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api.js";

/// The notebook folder holding images. The same constant the core keeps; it is
/// part of the file format, so it is written out rather than derived.
export const ASSETS_DIR = "assets";

/// What the app can draw. Mirrors `IMAGE_EXTENSIONS` in the core: an address
/// the app wrote must be one the app can show.
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];

/// Whether an address or file name reads as an image.
export function isImage(name) {
  const dot = String(name ?? "").lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

/// Whether an address points into the notebook's library — the only addresses
/// the app resolves. A link the user wrote to a file of their own is theirs,
/// and the app has no business rewriting it into a URL.
export function isAssetAddress(address) {
  const rest = String(address ?? "");
  if (!rest.startsWith(`${ASSETS_DIR}/`)) return false;
  const name = rest.slice(ASSETS_DIR.length + 1);
  return name.length > 0 && !name.includes("/") && isImage(name);
}

/// The file an address names, as a path of THIS machine.
///
/// The separator comes from the root the bridge gave us: a Windows notebook is
/// `C:\Users\gus\Caderno`, and gluing a slash onto it makes a path with two
/// kinds of separator in it. Empty string when there is nothing to resolve, so
/// a caller can hand the result straight to `src` and get a blank image
/// instead of a broken URL.
export function assetFile(root, address) {
  if (!root || !isAssetAddress(address)) return "";
  const windows = root.includes("\\") && !root.includes("/");
  const separator = windows ? "\\" : "/";
  const tail = windows ? address.replaceAll("/", "\\") : address;
  const base = root.endsWith(separator) ? root.slice(0, -separator.length) : root;
  return `${base}${separator}${tail}`;
}

/// The URL an `<img>` loads an asset from. Empty when the address is not one
/// of ours — see `assetFile`.
export function assetUrl(root, address) {
  const file = assetFile(root, address);
  return file ? convertFileSrc(file) : "";
}

/// The name a file goes into the library under.
///
/// A file PASTED from the clipboard usually has none — a screenshot is bytes
/// and a MIME type, not a document someone named — and the library is a folder
/// of real files, so one has to be invented. The type is the only thing known
/// about it, so the type is what names it.
export function libraryName(file) {
  const given = String(file?.name ?? "").trim();
  if (given) return given;
  const type = String(file?.type ?? "");
  // `image/svg+xml` is an SVG; the `+xml` says how it is written, not what it
  // is. Anything the app cannot name an extension for goes in without one —
  // better a file with no extension than a file claiming to be a PNG.
  const ext = type.startsWith("image/") ? type.slice(6).split("+")[0] : "";
  return ext ? `pasted.${ext}` : "pasted";
}

/// Reads a file the user picked in the webview as base64, for `importAsset`.
///
/// `readAsDataURL` and not `readAsArrayBuffer`: the bytes have to cross the IPC
/// as text anyway (Tauri's raw request body is documented as unavailable on
/// Android), and the browser's own encoder is faster than anything written
/// here. What comes back is `data:image/png;base64,AAAA…`; only the tail is
/// the payload.
export function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("could not read the file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma < 0 ? "" : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

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

/// What a gesture is carrying, in every shape this app has SEEN one arrive in.
///
/// The shapes, and how each was found (all measured 2026-08-19, with the
/// gesture logged from inside the running window — none of this was guessed):
///
///   1. `files` — bytes. What a `<input type="file">` gives, and what a pasted
///      IMAGE gives. Empty for anything that came out of a file manager.
///   2. `getData("text/uri-list" | "URL" | "text/plain")` — the address, when
///      the webview is willing to say it. Worth asking first because it costs
///      nothing; in this app's own window it answered `""` every time.
///   3. `items[…].getAsString("text/html")` — where the address actually WAS,
///      for a drag: WebKit hands over `<a …>file:///home/gus/foto.webp</a>`
///      while `text/uri-list` sits there empty beside it.
///   4. …and for a PASTE, nothing at all. Every accessor is empty, and the
///      only thing left holding the answer is the system clipboard, which is
///      read in Rust (`readPaste`, below).
///
/// The caller must `preventDefault()` BEFORE awaiting this: a transfer is only
/// readable while its event is being dispatched, and every read is started
/// synchronously.
export function readGesture(transfer) {
  const types = Array.from(transfer?.types ?? []);
  const files = Array.from(transfer?.files ?? []);
  if (files.length) return Promise.resolve({ files, paths: [], types });

  const written = ["text/uri-list", "URL", "text/plain"]
    .map((type) => {
      try {
        return String(transfer?.getData?.(type) ?? "");
      } catch {
        return "";
      }
    })
    .join("\n");

  const direct = pathsIn(written);
  if (direct.length) return Promise.resolve({ files: [], paths: direct, types });

  const strings = Array.from(transfer?.items ?? []).filter((item) => item.kind === "string");
  if (!strings.length) return Promise.resolve({ files: [], paths: [], types });
  return Promise.all(strings.map(asString)).then((values) => ({
    files: [],
    paths: pathsIn(values.join("\n")),
    types,
  }));
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

/// What a PASTE is carrying — the gesture with one more door.
///
/// When the webview has nothing to say (which, for a file copied in a file
/// manager, is every single time), the system clipboard is asked directly.
/// That question can only be answered outside the webview, so it crosses the
/// bridge.
/// Everything a gesture brought, including a picture that is only on the web.
///
/// `remote` is an address and not a file: it is a REQUEST to make, and the
/// shell asks before making it. Kept apart from `paths` for exactly that
/// reason — one of them is already on this machine and the other is not.
export async function readForNote(transfer, read) {
  // Started here, before anything is awaited: a `DataTransfer` is disconnected
  // the moment its event finishes dispatching and answers as if it were empty
  // from then on (W3C Clipboard API). The same trap that kept the system
  // clipboard from ever being asked.
  const html = carriesMarkup(transfer) ? htmlOf(transfer) : null;
  const brought = await read(transfer);
  if (brought.files.length || brought.paths.length || !html) return brought;
  return { ...brought, remote: remoteImageIn(await html) };
}

/// The html flavour of a gesture, read through the item list. Empty when the
/// gesture has none — or when the transfer has already been disconnected,
/// which is why the CALLER decides whether to ask at all.
function htmlOf(transfer) {
  const item = Array.from(transfer?.items ?? []).find(
    (candidate) => candidate.kind === "string" && candidate.type === "text/html",
  );
  return item ? asString(item) : Promise.resolve("");
}

export async function readPaste(clipboardData) {
  // **Read BEFORE the await, and never again after it.** When a paste event
  // finishes dispatching, the spec puts the clipboard store in Protected mode
  // and disconnects the `DataTransfer` — which from then on "appears empty"
  // (W3C Clipboard API, §the paste action). So `clipboardData.types` answers
  // `[]` on the far side of an `await`, and asking it there is what kept the
  // system clipboard from ever being consulted: the condition below was
  // reading a neutered object and always saying no.
  const declared = carriesFiles(clipboardData);
  const brought = await readGesture(clipboardData);
  if (brought.files.length || brought.paths.length) return brought;
  if (!declared) return brought;
  try {
    const uris = (await api.clipboardFiles()) ?? [];
    return { ...brought, paths: uris.map(pathOfFileUrl).filter(Boolean) };
  } catch {
    return brought;
  }
}

/// A picture on the internet named by the gesture, or `""`.
///
/// The shape a picture copied from a WEB PAGE arrives in (measured
/// 2026-08-19): `text/html` holding `<img src="https://…">` and nothing else
/// — no bytes, no local file. Drawing it means downloading it, which is the
/// one thing this app does that leaves the machine, so it is never done
/// without being asked (`confirmImageDownloads`).
///
/// Only `https`, and only the FIRST: pasting a page's worth of markup is not
/// a request to fill the library.
export function remoteImageIn(text) {
  const found = String(text ?? "").match(/https:\/\/[^\s"'<>]+/g) ?? [];
  return found[0] ?? "";
}

/// Whether a gesture is worth taking over. Asked on `dragover`, where the
/// data is still sealed and only the TYPES are readable — and asked again
/// before a paste, so a gesture that says "a file" is answered even when
/// nothing readable comes out of it (which is then reported, not swallowed).
///
/// `Files` is what a webview says when it holds bytes; `text/uri-list` is what
/// a desktop says when it holds an address, and it is the one the app's own
/// window turned out to send (measured 2026-08-19).
export function carriesFiles(transfer) {
  const types = Array.from(transfer?.types ?? []);
  return types.includes("Files") || types.includes("text/uri-list");
}

/// Whether a gesture might be a picture from a web page — `text/html` and no
/// local file in sight. Asked synchronously, before anything is awaited, for
/// the reason `readPaste` gives.
export function carriesMarkup(transfer) {
  return Array.from(transfer?.types ?? []).includes("text/html");
}

/// The local files named in a blob of text, in the order they appear.
///
/// Two readings of the same blob, because the two flavours differ in shape: a
/// uri-list is one address per line, and the html flavour is a whole `<a>`
/// with the address as its TEXT. Scanning for `file://…` finds it in either,
/// and the results are deduplicated because a gesture usually carries both.
function pathsIn(text) {
  const blob = String(text ?? "");
  const lines = blob
    .split(/\r?\n/)
    // A uri-list comments with `#`, which is part of its format.
    .filter((line) => line && !line.startsWith("#"));
  // Stops at the delimiters an address cannot contain once it is written into
  // markup or into a list: quotes, angle brackets, whitespace.
  const embedded = blob.match(/file:\/\/[^\s"'<>]+/g) ?? [];

  const seen = new Set();
  return [...lines, ...embedded]
    .map(pathOfFileUrl)
    .filter((path) => path && !seen.has(path) && seen.add(path));
}

/// Writes everything a gesture brought into the library, in order, whichever
/// shape it arrived in.
export async function importBrought({ files = [], paths = [] } = {}) {
  const added = await importFiles(files);
  for (const path of paths) added.push(await api.importAssetFromPath(path));
  return added;
}

/// Writes files the user brought in — a file input, a paste, a drop — into the
/// library, in order, and answers with the addresses.
///
/// One at a time on purpose: a phone importing eight photos at once would hold
/// eight base64 copies in memory, and the writes have to be ordered anyway —
/// two files of the same name are suffixed by whoever gets there first.
///
/// **Any file goes in** (2026-08-18): a task attaches a PDF as readily as a
/// photo, and the library is where both live. What only an image can be is
/// DRAWN — a banner, a picture inside a note, a thumbnail — and that is
/// `isImage`, asked where the drawing happens.
export async function importFiles(files) {
  const added = [];
  for (const file of Array.from(files ?? [])) {
    added.push(await api.importAsset(libraryName(file), await readAsBase64(file)));
  }
  return added;
}
