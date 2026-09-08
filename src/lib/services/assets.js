// The notebook's image library, on this side of the bridge. An asset ADDRESS
// is what a note carries — `assets/sunset.jpg`, relative to the notebook root
// (the core keeps the same rule in `core/src/assets.rs`). An `<img>` loads it
// by URL through Tauri's asset protocol, whose scope is filled at runtime with
// the open notebook's `assets/` and nothing else (`commands::allow_assets`).

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

/// The file an address names, as a path of THIS machine. The separator comes
/// from the root the bridge gave (a Windows root is `C:\Users\…`). Empty
/// string when there is nothing to resolve, so `src` gets a blank image
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
/// of ours — see `assetFile`. `version` is a cache-buster: without it a file
/// deleted from the library kept drawing, the webview having the bytes. The
/// asset protocol resolves the path and ignores the query.
export function assetUrl(root, address, version = 0) {
  const file = assetFile(root, address);
  if (!file) return "";
  const url = convertFileSrc(file);
  return version ? `${url}?v=${version}` : url;
}

/// The name a file goes into the library under. A file PASTED from the
/// clipboard usually has none (a screenshot is bytes and a MIME type), so
/// the type is what names it.
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
/// `readAsDataURL`, not `readAsArrayBuffer`: the bytes cross the IPC as text
/// anyway (Tauri's raw request body is unavailable on Android). Only the tail
/// after the comma of `data:image/png;base64,…` is the payload.
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

/// Writes into the library everything a gesture brought — bytes in hand, or
/// files of this machine named by address (`services/gesture.js`). An address
/// is copied by the bridge, not read here and sent back as base64.
export async function importBrought({ files = [], paths = [] } = {}) {
  const added = await importFiles(files);
  for (const path of paths) added.push(await api.importAssetFromPath(path));
  return added;
}

/// Writes files the user brought in into the library, in order, and answers
/// with the addresses. One at a time: eight photos at once would hold eight
/// base64 copies, and same-name suffixing depends on order. ANY file goes in
/// (a PDF as readily as a photo); only what is DRAWN is gated by `isImage`.
export async function importFiles(files) {
  const added = [];
  for (const file of Array.from(files ?? [])) {
    added.push(await api.importAsset(libraryName(file), await readAsBase64(file)));
  }
  return added;
}
