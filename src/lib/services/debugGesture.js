// TEMPORARY (2026-08-19) — watching a drag and a paste from outside.
//
// The gestures do nothing in the real app and everything in every test, and a
// webview on this machine cannot be watched: no drivable devtools, no
// screenshot on Wayland. So the app writes down what it saw, in the order it
// saw it, and the log is read afterwards.
//
// Listening on the DOCUMENT and in the CAPTURE phase on purpose: that is the
// earliest any of these can be seen, so a line missing here means the event
// never reached the page at all — which is a different bug from an event that
// arrives carrying nothing. Remove this file and `commands::debug_log` once
// the answer is in.

import { api } from "./api.js";

const say = (line) => api.debugLog(line).catch(() => {});

/// Everything readable about what a gesture is carrying, without consuming it.
function describe(transfer) {
  if (!transfer) return "no transfer";
  const types = Array.from(transfer.types ?? []);
  const parts = [`types=[${types.join("|")}]`, `files=${transfer.files?.length ?? "?"}`];
  for (const type of ["text/uri-list", "text/plain"]) {
    let value = "";
    try {
      value = String(transfer.getData?.(type) ?? "");
    } catch (e) {
      value = `<getData threw: ${e}>`;
    }
    if (value) parts.push(`${type}=${JSON.stringify(value.slice(0, 200))}`);
  }
  parts.push(`URL=${JSON.stringify(String(transfer.getData?.("URL") ?? ""))}`);
  if (transfer.items) {
    const items = Array.from(transfer.items).map((i) => `${i.kind}:${i.type}`);
    parts.push(`items=[${items.join("|")}]`);
    // The other door, and the one the app now uses: a callback, so it is
    // reported on its own line whenever it answers.
    for (const item of Array.from(transfer.items)) {
      if (item.kind !== "string") continue;
      const type = item.type;
      try {
        item.getAsString((value) => say(`  getAsString(${type}) = ${JSON.stringify(value)}`));
      } catch (e) {
        say(`  getAsString(${type}) threw ${e}`);
      }
    }
  }
  return parts.join(" ");
}

const where = (target) => {
  const el = target instanceof Element ? target : null;
  if (!el) return String(target);
  const inEditor = !!el.closest?.(".cm-editor");
  return `${el.tagName.toLowerCase()}.${el.className || "-"} inEditor=${inEditor}`;
};

let watching = false;

export function watchGestures() {
  // The shell installs this from an effect, and an effect re-runs — which was
  // adding a listener each time and writing every line four and six times over.
  if (watching) return;
  watching = true;
  let dragSeen = 0;
  say(`--- watching, ${new Date().toISOString()} ---`);

  for (const type of ["dragenter", "dragover", "dragleave", "drop"]) {
    document.addEventListener(
      type,
      (event) => {
        // A dragover fires many times a second; one line per drag is enough
        // to know it arrived.
        if (type === "dragover" && dragSeen++ % 40 !== 0) return;
        say(`${type} on ${where(event.target)} :: ${describe(event.dataTransfer)}`);
      },
      true,
    );
  }

  document.addEventListener(
    "paste",
    (event) => say(`paste on ${where(event.target)} :: ${describe(event.clipboardData)}`),
    true,
  );
}
