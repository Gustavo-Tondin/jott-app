// Which way ANDROID draws the icons of the status and navigation bars: dark
// on a light ground, light on a dark one. The system decides this from the
// PHONE's dark mode, and the app's mode is its own choice (services/themes.js)
// — a light app under a dark phone left white icons on a white bar. So the
// page measures the ground it paints and says. `MainActivity` hangs
// `systemBars` on the same `window.JottAndroid` bridge as the storage calls.

/// The probes, one per region and KEPT, because this is read on every refresh
/// of the notebook: a probe appended and thrown away costs a whole style
/// recalculation each time it is read, and one that stays costs the reading
/// alone (measured 2026-09-09, both regions at once, over the app's own
/// stylesheet: 206 µs against 1.4 µs). Per document, so a test's is not the
/// app's; remade if something empties the body under them.
const probes = new WeakMap();

function probeIn(region, doc) {
  let byRegion = probes.get(doc);
  if (!byRegion) probes.set(doc, (byRegion = new Map()));
  const kept = byRegion.get(region);
  if (kept?.isConnected) return kept;
  const probe = doc.createElement("div");
  probe.setAttribute("data-region", region);
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none;inline-size:0;block-size:0;background:var(--app-bg)";
  doc.body.append(probe);
  byRegion.set(region, probe);
  return probe;
}

/// The colour a region's ground computes to, as the engine resolves it
/// ("rgb(…)"). Measured on a hidden probe wearing the region's own attribute,
/// never read as a custom property: `--app-bg` is assigned per region
/// (styles/roles.css) and its computed value is whatever the theme wrote,
/// which may be another `var()` away from a colour.
export function groundColor(region, doc = document) {
  if (!doc?.body) return "";
  const probe = probeIn(region, doc);
  return doc.defaultView?.getComputedStyle(probe).backgroundColor ?? "";
}

/// Whether a computed colour is dark enough that light icons read on it, or
/// null when the string is not one this knows how to weigh — a wrong answer
/// here is an unreadable status bar, so an unknown one is no answer at all.
/// Relative luminance (sRGB), with the half-way point as the line.
export function isDarkColor(color) {
  const parts = /^rgba?\(([^)]+)\)$/.exec(String(color ?? "").trim());
  if (!parts) return null;
  const numbers = parts[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (numbers.length < 3 || numbers.some((n) => !Number.isFinite(n))) return null;
  // A ground one can see through says nothing about what shows through it.
  if (numbers.length > 3 && numbers[3] < 0.5) return null;
  const channel = (value) => {
    const c = Math.min(255, Math.max(0, value)) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = numbers;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b) < 0.5;
}

/// What each bridge was last told, so the same answer is not sent twice.
const told = new WeakMap();

/// Tells Android which ground each of its bars is over — the status bar at the
/// top of the page, the navigation bar at the bottom, and they are NOT always
/// the same one: a mode paints the chrome and the canvas in two colours
/// (styles/modes/jott.css), and on a phone the top of the screen is the
/// chrome's while the bottom is the canvas's.
///
/// Answers `{ top, bottom }` as told, or null where there was nothing to say
/// to (every desktop) or nothing worth saying (a ground that could not be
/// weighed): the bars then keep whatever they had, which beats a guess.
export function tellSystemBars(top, bottom, { doc = document, win = window } = {}) {
  const bridge = win?.JottAndroid;
  if (!bridge?.systemBars) return null;
  const darkTop = isDarkColor(groundColor(top, doc));
  const darkBottom = isDarkColor(groundColor(bottom, doc));
  if (darkTop === null || darkBottom === null) return null;
  // Said once. The caller reads the notebook's settings, so it runs again on
  // every refresh of it — and crossing into Java is the one expensive step
  // here. Kept against the BRIDGE, so a page with a new one starts over.
  const said = told.get(bridge);
  if (said?.top === darkTop && said?.bottom === darkBottom) {
    return said;
  }
  try {
    bridge.systemBars(darkTop, darkBottom);
  } catch {
    // A bridge that throws is a bridge that cannot answer; the app has
    // nothing to do about it and the page must not stop for it.
    return null;
  }
  const answer = { top: darkTop, bottom: darkBottom };
  told.set(bridge, answer);
  return answer;
}
