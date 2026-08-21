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
//
// What a drag or a paste is CARRYING is a different question, and lives in
// `services/gesture.js` — this file is about the library and its addresses.

import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./api.js";
import { extensionOf } from "./paths.js";

/// The notebook folder holding images. The same constant the core keeps; it is
/// part of the file format, so it is written out rather than derived.
export const ASSETS_DIR = "assets";

/// What the app can draw. Mirrors `IMAGE_EXTENSIONS` in the core: an address
/// the app wrote must be one the app can show.
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];

/// Whether an address or file name reads as an image.
export function isImage(name) {
  return IMAGE_EXTENSIONS.includes(extensionOf(name));
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
///
/// `version` is a cache-buster, and it earns its place: a file deleted from
/// the library kept DRAWING in the open note, because the webview had the
/// bytes and nothing had asked it again (user report, 2026-08-19). Tauri's
/// asset protocol resolves the path and ignores the query
/// (`tauri/src/protocol/asset.rs`), so a query string changes the URL for the
/// cache without changing which file is served.
export function assetUrl(root, address, version = 0) {
  const file = assetFile(root, address);
  if (!file) return "";
  const url = convertFileSrc(file);
  return version ? `${url}?v=${version}` : url;
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

/// Writes into the library everything a gesture brought, whichever shape it
/// arrived in — bytes in hand, or files of this machine named by address
/// (`services/gesture.js`).
///
/// An address is copied by the bridge rather than being read here and sent
/// back as base64: a five-megabyte photo has no business crossing the IPC
/// twice to end up in a folder the app can reach on its own.
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
