// What a key press is CALLED, in one place — the shell (DOM event), CodeMirror
// ("Mod-b") and the settings screen ("Ctrl+B") must agree. A chord is ONE
// string: modifiers in a fixed order, then the key. `Mod` is the platform's
// own modifier (Ctrl on Linux/Windows, Cmd on macOS), drawn as `Ctrl` or `⌘`
// only on screen.

/// The order modifiers are written in. Fixed, because "Ctrl+Shift+F" and
/// "Shift+Ctrl+F" must not be two different keys in a config file.
const ORDER = ["Mod", "Ctrl", "Alt", "Shift"];

/// Keys whose name is already a word. Anything else is a single character and
/// is written upper case, so `a` and `A` are the same chord — a keyboard has
/// one of that key, and Shift is spelled out separately.
const NAMED = new Set([
  "Escape",
  "Enter",
  "Tab",
  "Space",
  "Backspace",
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
]);

/// The chord a DOM event is, or null when it is not one — a press that is
/// only modifiers is the first half of a chord, not a shortcut.
export function chordOf(event) {
  if (!event) return null;
  const key = keyName(event.key, event.code);
  if (!key) return null;

  const parts = [];
  // Ctrl and Meta both mean "the platform modifier". They are folded into one
  // name so a notebook written on a Mac reads on Linux — the file says what
  // the chord MEANS, not which physical key was under the finger.
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/// The name of the key itself — the part after the modifiers.
function keyName(key, code) {
  if (!key) return null;
  // A modifier alone is not a key.
  if (["Control", "Meta", "Alt", "Shift"].includes(key)) return null;
  if (key === " ") return "Space";
  if (NAMED.has(key)) return key;
  if (key.length === 1) {
    // The DIGIT of a number key, not the character Shift or a layout put
    // there: `Ctrl+Shift+7` has to stay the 7 key, and on many layouts that
    // press reports "&". The code is the physical key and does not move.
    const digit = /^Digit([0-9])$/.exec(code ?? "");
    if (digit) return digit[1];
    return key.toUpperCase();
  }
  return null;
}

/// Reads a chord back into its pieces. Tolerant on purpose: it is fed strings
/// from a config file, which a user may have typed by hand.
export function partsOf(chord) {
  const raw = String(chord ?? "")
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (raw.length === 0) return null;
  const key = raw[raw.length - 1];
  const mods = new Set(raw.slice(0, -1).map(canonicalMod).filter(Boolean));
  const name = keyName(key.length === 1 ? key : key, null) ?? key;
  return { mods, key: name };
}

function canonicalMod(mod) {
  const m = mod.toLowerCase();
  if (m === "mod" || m === "ctrl" || m === "control" || m === "cmd" || m === "meta")
    return "Mod";
  if (m === "alt" || m === "option") return "Alt";
  if (m === "shift") return "Shift";
  return null;
}

/// The same chord, written the one way. Used on anything that comes from
/// outside this module — a config file, a hand-written default.
export function normalize(chord) {
  const parts = partsOf(chord);
  if (!parts) return null;
  const mods = ORDER.filter((m) => parts.mods.has(m));
  return [...mods, parts.key].join("+");
}

/// Is this chord safe to hand out as a shortcut? A bare letter or a bare
/// `Shift+letter` is someone typing; anything carrying Mod or Alt, and the
/// named keys that mean nothing typed into a document, is the app's to claim.
export function isBindable(chord) {
  const parts = partsOf(chord);
  if (!parts) return false;
  if (parts.mods.has("Mod") || parts.mods.has("Alt")) return true;
  return NAMED.has(parts.key) && parts.key !== "Space";
}

/// The chord in CodeMirror's dialect, so a binding the user typed reaches the
/// editor's keymap unchanged.
export function toCodeMirror(chord) {
  const parts = partsOf(chord);
  if (!parts) return null;
  const mods = [];
  if (parts.mods.has("Mod")) mods.push("Mod");
  if (parts.mods.has("Alt")) mods.push("Alt");
  if (parts.mods.has("Shift")) mods.push("Shift");
  // CodeMirror wants a bare character lower case and a named key as it is.
  const key = parts.key.length === 1 ? parts.key.toLowerCase() : parts.key;
  return [...mods, key].join("-");
}

/// How the chord is DRAWN — the only place the platform's own spelling
/// appears. `mac` is passed in rather than sniffed, so the tests can ask for
/// both without a window.
export function formatChord(chord, mac = isMac()) {
  const parts = partsOf(chord);
  if (!parts) return "";
  const out = [];
  if (parts.mods.has("Mod")) out.push(mac ? "⌘" : "Ctrl");
  if (parts.mods.has("Alt")) out.push(mac ? "⌥" : "Alt");
  if (parts.mods.has("Shift")) out.push(mac ? "⇧" : "Shift");
  out.push(KEY_LABELS[parts.key] ?? parts.key);
  return mac ? out.join("") : out.join("+");
}

/// The few keys whose name is longer than the glyph everyone reads.
const KEY_LABELS = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
};

export function isMac() {
  if (typeof navigator === "undefined") return false;
  return /mac/i.test(navigator.platform ?? navigator.userAgent ?? "");
}
