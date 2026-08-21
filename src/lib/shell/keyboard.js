// How much of the page the on-screen keyboard is actually covering.
//
// The activity publishes the raw IME inset it reads from the window
// (`--android-ime`, MainActivity.kt). That number is what the SYSTEM covers of
// the WINDOW; what the layout needs is what is covered of the PAGE, and the
// two stop agreeing the moment anything between them shrinks:
//
//   Chrome M139 made the IME resize the visual viewport in every Android
//   WebView. Before it, the page saw nothing at all — `visualViewport.height`
//   and `innerHeight` both stayed at the full window with the keyboard over
//   the bottom third of it (measured here on WebView 133, 2026-08-18, which is
//   why the app grew this variable in the first place). After it, the page is
//   told.
//
// WHAT THE ANSWER IS MEASURED AGAINST IS THE ICB, and that is the whole of
// this file. `#app` is `height: 100%`, and 100% of the root resolves against
// the INITIAL CONTAINING BLOCK — the layout viewport — which is
// `documentElement.clientHeight` and nothing else. Neither `innerHeight` nor
// `visualViewport.height` is that number on Android: both follow the VISUAL
// viewport, which the M139 WebView shrinks while the page it is a window onto
// keeps its full height. Comparing the inset against either of them answers a
// question the CSS never asked.
//
// The version that did compare against them (0.22.1) also had to remember a
// "rest height" to compare with, and that remembered number is what broke on
// device: the keyboard's animation reports its inset frame by frame, so it
// passes through zero on the way up and lands on zero on the way down while
// the visual viewport is still short — and a rest height learned from one of
// those frames is the height WITH the keyboard up. From then on the page
// believed it had given up nothing, added the full inset to the gap it could
// already see, and subtracted the keyboard TWICE. Measured off the device
// video (2026-08-21): 800px screen, 324px keyboard, `#app` left 108px tall —
// `800 − 2×324 − 48`, the note reduced to a white sliver under the title bar
// with the formatting strip stranded in the middle of the screen.
//
// So nothing is remembered here any more, and the visual viewport is not
// consulted at all. Two numbers, one subtraction, no history to corrupt and no
// feedback loop: the panning of the visual viewport used to feed back into
// `#app`'s height, which re-laid out the page, which moved the pan again
// ("nota fica pulando ao digitar").
//
// THE HEIGHT COMPARED AGAINST IS `screen.height`, and it has to be something
// the keyboard cannot move. The first attempt asked the activity for its
// decor view's height, on the reasoning that Android knows its own window —
// but `adjustResize` RESIZES that window for the keyboard, so on device the
// published height shrank in step with the ICB, the subtraction came out
// zero, and the keyboard was cleared twice again. Worse, it was a RACE: the
// inset listener runs before the relayout, so whether the old height or the
// new one got published depended on the frame, and the same build behaved
// differently in a note and on the Home screen (measured on device,
// 2026-08-21).
//
// The screen cannot shrink. In split screen it is bigger than the window,
// which makes the subtraction overshoot and the answer zero — the app then
// leaves the keyboard to whatever the WebView already did, which is the safe
// direction to be wrong in (nothing is ever lifted twice).

/// What the keyboard covers of the LAYOUT viewport — the coordinates
/// `height: 100%` and `position: fixed` are both expressed in.
///
/// `ime` is what Android says the keyboard covers of the window, `screen` is
/// the height of the display — the one measurement the keyboard cannot change
/// — and `layout` is the page's own initial containing block. All in CSS
/// pixels.
///
/// The three ways a WebView can answer, and why one subtraction covers all of
/// them:
///
///   - it says nothing (WebView 133): the ICB is the whole window, and the
///     whole inset is still to be cleared.
///   - it shrinks the VISUAL viewport (M139): the ICB is STILL the whole
///     window — the page keeps its layout height with a shorter window onto
///     it — so the whole inset is still to be cleared, and clearing it is what
///     stops the last line of the note from living under the keys where only
///     panning could reach it.
///   - it shrinks the LAYOUT viewport (`interactive-widget=resizes-content`,
///     or a window the system itself resized): the ICB is already short of the
///     window by what the keyboard took, and there is nothing left to clear.
///
/// Never negative: a page whose ICB is shorter than the screen by MORE than
/// the keyboard (a system bar, a split screen) has the keyboard fully
/// accounted for, not height owed back to it.
export function keyboardCover({ ime, screen, layout }) {
  if (!(ime > 0)) return 0;
  const shrunk = Math.max(0, (screen || 0) - (layout || 0));
  return Math.max(0, ime - shrunk);
}

/// Puts the page back where it belongs after the WebView has dragged it.
///
/// A WebView that shrinks the visual viewport also lets the page be PANNED
/// under it, and it pans on its own the moment a field is focused near the
/// bottom — using the keyboard's final height, before this app has had a frame
/// to make room. The room then gets made and the drag stays, which is a Home
/// screen with its composer at the top of the display and the document's own
/// background filling everything below it (measured on device, 2026-08-21 —
/// dragging the page down by hand restored it perfectly, which is what
/// identified the pan).
///
/// Undoing it unconditionally is right for THIS app and would not be for a
/// scrolling page: `#app` ends exactly where the keyboard begins, so nothing
/// is ever hidden under the keys and a pan can only ever be the WebView's
/// leftover.
///
/// `scrollIntoView` IS THE ONLY THING THAT MOVES IT, and that is measured, not
/// chosen. With the page sitting at `offsetTop` 368 on device, `scrollTo(0,0)`,
/// `scrollBy(0,-400)` and writing `document.scrollingElement.scrollTop` all
/// left it at 368 — the visual viewport is not the scroll position, and the
/// page had none to change (`scrollY` was 0 throughout). Asking to see the top
/// of `#app` put it back to 0. There is no visual-viewport API to write; the
/// offset is read-only.
///
/// Answering the pan ITSELF is safe here, and was not in the version that
/// derived the keyboard's height from the visual viewport: there, a pan
/// changed `#app`'s height, which re-laid out the page, which moved the pan —
/// a loop with no fixed point. Nothing above reads the visual viewport any
/// more, so writing the offset back to zero changes no input to anything: the
/// listener fires once more, finds zero, and stops. Which is what makes the
/// USER's drag answerable too — with `user-scalable=no` (index.html) there is
/// no pinch-zoom and so no pan this app owes anyone, and dragging the page up
/// with the keyboard open showed nothing but the document's background below
/// where the app ends (user report on device, 2026-08-21).
function unpan(win) {
  if (!(win.visualViewport?.offsetTop > 0)) return;
  document.getElementById("app")?.scrollIntoView({ block: "start" });
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
/// Two things can change the answer and both are listened to: the activity
/// announcing a new inset (`android-insets`, which fires every frame of the
/// keyboard's animation) and the layout viewport resizing (`resize`). The
/// visual viewport's own resize is deliberately NOT one of them — see the file
/// comment; its SCROLL is listened to for a different job, [unpan].
export function installKeyboard({ root = document.documentElement, win = window } = {}) {
  const update = () => {
    const cover = keyboardCover({
      ime: pxOf(root, "--android-ime"),
      screen: win.screen?.height,
      layout: root.clientHeight,
    });
    root.style.setProperty("--theme-keyboard", `${cover}px`);
    unpan(win);
  };

  const straighten = () => unpan(win);

  update();
  document.addEventListener("android-insets", update);
  win.addEventListener("resize", update);
  win.visualViewport?.addEventListener("scroll", straighten);
  return () => {
    document.removeEventListener("android-insets", update);
    win.removeEventListener("resize", update);
    win.visualViewport?.removeEventListener("scroll", straighten);
  };
}
