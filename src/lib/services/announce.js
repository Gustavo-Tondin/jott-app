// THE APP'S ONE LIVE REGION: what a screen reader is told when something
// happens that leaves nothing new to read. Moving a task is the case this was
// built for — the list redraws, the card is somewhere else, and to a reader
// who cannot see it nothing happened at all.
// One region for the whole app (App.svelte owns the node, styles/controls/
// feedback.css hides it): several would each be read in turn.

let region = null;

/// Registered by App.svelte, and null on teardown.
export function setLiveRegion(node) {
  region = node ?? null;
}

/// Says it, politely — the reader finishes its sentence first. THE SAME WORDS
/// TWICE ARE SILENT: an unchanged region is not a change, and a task moved up
/// twice says the same thing about two different positions only by luck. The
/// repeat carries a trailing space, which is a change and is not read out.
export function announce(text) {
  if (!region || !text) return;
  region.textContent = region.textContent === text ? `${text} ` : text;
}
