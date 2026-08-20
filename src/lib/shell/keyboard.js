// How much of the page the on-screen keyboard is actually covering.
//
// The activity publishes the raw IME inset it reads from the window
// (`--android-ime`, MainActivity.kt). That number is what the SYSTEM is
// covering of the WINDOW — and it stops being the answer the layout needs the
// moment the WebView starts shrinking the page on its own, which is exactly
// what changed under us:
//
//   Chrome M139 made the IME resize the visual viewport in every Android
//   WebView. Before it, the page saw nothing at all — `visualViewport.height`
//   and `innerHeight` both stayed at the full window with the keyboard over
//   the bottom third of it (measured here on WebView 133, 2026-08-18, which is
//   why the app grew this variable in the first place). After it, the page is
//   told; and an app that ALSO lifts everything by the inset lifts it twice,
//   which is a formatting strip floating in the middle of a note over nothing
//   (user report on device, 2026-08-20).
//
// So the inset is not trusted as a distance — it is compared against what the
// page can see for itself. Whatever the viewport already gave up to the
// keyboard is subtracted, and what is left is what the app still has to clear
// by hand: the full inset on an old WebView, zero on a new one, and the right
// number on any behaviour in between, without this file knowing which is which
// or asking the WebView its version.

/// How far above the bottom of the LAYOUT viewport the visible bottom is —
/// which is where anything that must clear the keyboard belongs.
///
/// `inner` is the layout viewport's height and `rest` was its usable height
/// with no keyboard up; `viewportTop`/`viewportHeight` are the visual
/// viewport's, and `ime` is what Android says the keyboard covers of the
/// window. Everything is in CSS pixels.
///
/// The three ways a WebView can answer, and why one formula covers all of
/// them:
///
///   - it says nothing (WebView 133): the visual viewport matches the layout
///     one, and the whole inset is still to be cleared.
///   - it shrinks the VISUAL viewport (M139): the page keeps its layout
///     height with a shorter window onto it, and — this is the part that
///     bites — that window can be SCROLLED, to reach what is under the
///     keyboard. A `position: fixed` box is nailed to the layout viewport, so
///     the moment the page is panned the strip travels with the page instead
///     of staying above the keys (user report on device, 2026-08-21). The
///     distance from the layout bottom to the visual bottom is what tracks it.
///   - it shrinks the LAYOUT viewport (`interactive-widget=resizes-content`,
///     where it is honoured): the page already ends above the keyboard and
///     there is nothing left to clear.
///
/// Never negative: a viewport that shrank by MORE than the keyboard (a resize
/// for another reason) means the keyboard is fully accounted for, not that the
/// page owes height back.
export function keyboardCover({
  ime,
  rest,
  inner,
  viewportTop = 0,
  viewportHeight = inner,
}) {
  // The bottom the user can actually see, in the coordinates a fixed box is
  // positioned in.
  const seen = Math.max(0, (inner || 0) - (viewportTop + (viewportHeight ?? inner ?? 0)));
  if (!(ime > 0)) return seen;
  // What the page gave up on its own, whichever way it gave it up.
  const gaveUp = Math.max(0, (rest || 0) - Math.min(inner || 0, viewportHeight ?? inner ?? 0));
  return seen + Math.max(0, ime - gaveUp);
}

/// Reads a `px` custom property off `el`, as a number. Anything unparseable —
/// unset, empty, a unit this does not speak — is zero, which is the answer
/// that leaves the layout as it is rather than moving it somewhere invented.
export function pxOf(el, name) {
  const raw = getComputedStyle(el).getPropertyValue(name);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

/// Keeps `--theme-keyboard` — the token the strip, the composer and the sheets
/// read — equal to what the keyboard actually covers. Returns the uninstall.
///
/// Three things can change the answer and all three are listened to: the
/// activity announcing a new inset (`android-insets`), the layout viewport
/// resizing (`resize`), and the visual viewport resizing, which on a WebView
/// that resizes only THAT is the only event there is.
///
/// The rest height is remembered per viewport WIDTH, and as the largest one
/// seen there: a phone rotated with the keyboard up has no other way of
/// knowing how tall the page is without it, and the first pass with the
/// keyboard down corrects the guess anyway.
export function installKeyboard({ root = document.documentElement, win = window } = {}) {
  const rests = new Map();
  /// Whether this WebView has ever been SEEN shrinking the page for the
  /// keyboard. It is the only honest way to guess a rest height that was
  /// never measured — see below.
  let resizes = false;

  const update = () => {
    const ime = pxOf(root, "--android-ime");
    const inner = win.innerHeight;
    const width = win.innerWidth;
    const view = win.visualViewport;
    const viewportHeight = view ? view.height : inner;
    const viewportTop = view ? view.offsetTop : 0;
    // What the page can actually show, whichever viewport is the shorter one.
    const usable = Math.min(inner, viewportHeight);
    // With no keyboard up, THIS is the page's full height — the measurement
    // everything else is relative to.
    if (ime <= 0) rests.set(width, usable);
    else if (rests.has(width)) {
      if (usable < rests.get(width)) resizes = true;
    } else {
      // Arriving at this width for the first time with the keyboard already
      // up — a phone rotated mid-sentence. There is nothing to measure, so
      // the guess is what this WebView was already seen doing.
      rests.set(width, resizes ? usable + ime : usable);
    }

    const cover = keyboardCover({
      ime,
      rest: rests.get(width) ?? usable,
      inner,
      viewportTop,
      viewportHeight,
    });
    root.style.setProperty("--theme-keyboard", `${cover}px`);
  };

  update();
  document.addEventListener("android-insets", update);
  win.addEventListener("resize", update);
  win.visualViewport?.addEventListener("resize", update);
  // The pan, which fires no resize at all: the visual viewport keeps its size
  // and slides over the page, and that is exactly the case this file grew for.
  win.visualViewport?.addEventListener("scroll", update);
  return () => {
    document.removeEventListener("android-insets", update);
    win.removeEventListener("resize", update);
    win.visualViewport?.removeEventListener("resize", update);
    win.visualViewport?.removeEventListener("scroll", update);
  };
}
