#!/usr/bin/env python3
"""Write a Jott theme from a handful of colours you like.

A theme is 91 tokens, and 68 of them are arithmetic: every family runs the same
seven tones, and the app's contrast promises depend on hitting them. Choosing
those by hand is how a theme ends up pretty in one region and unreadable in the
other. So you choose the colours; this fills in the grid.

    ./make-theme.py --name midnight \
        --paper "#f7f6f4" --ground "#16151a" \
        --1 "#0076c3" --4 "#d73035" --7 "#12c37c"

Every slot you leave out keeps the factory theme's hue. What is read from the
colour you give is its HUE — the tone and the saturation are rebuilt on the
grid, which is why a muddy pick still comes out as a usable ramp.

Output goes to stdout, or to a file with -o. Drop it in `.jott/themes/` and the
app offers it in Settings › Display › Theme.

Slots are numbered, not named (documentation/theming.md): 1 is the app's own
and the rest walk the wheel. `neutral` is the grey axis and takes no hue.
Requires only the standard library.

    --check <file>   re-measure an existing theme instead of writing one
    --debug          show every search
"""

import argparse
import logging
import math
import os
import re
import sys

log = logging.getLogger("make-theme")

# --- OKLab, spelled out so this file needs nothing installed ----------------
M1 = ((0.4122214708, 0.5363325363, 0.0514459929),
      (0.2119034982, 0.6806995451, 0.1073969566),
      (0.0883024619, 0.2817188376, 0.6299787005))
M2 = ((0.2104542553, 0.7936177850, -0.0040720468),
      (1.9779984951, -2.4285922050, 0.4505937099),
      (0.0259040371, 0.7827717662, -0.8086757660))
M2i = ((1, 0.3963377774, 0.2158037573), (1, -0.1055613458, -0.0638541728),
       (1, -0.0894841775, -1.2914855480))
M1i = ((4.0767416621, -3.3077115913, 0.2309699292), (-1.2684380046, 2.6097574011, -0.3413193965),
       (-0.0041960863, -0.7034186147, 1.7076147010))


def _mul(m, v):
    return tuple(sum(k * v[i] for i, k in enumerate(row)) for row in m)


def _to_linear(hex_str):
    h = hex_str.lstrip("#")
    out = []
    for i in (0, 2, 4):
        v = int(h[i:i + 2], 16) / 255
        out.append(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4)
    return out


def _encode(c):
    c = max(0.0, min(1.0, c))
    return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def _to_hex(lin):
    return "#" + "".join(f"{round(_encode(c) * 255):02x}" for c in lin)


def hue_of(hex_str):
    """The OKLCH hue angle of a colour — all this reads from your pick."""
    lab = _mul(M2, tuple(x ** (1 / 3) for x in _mul(M1, _to_linear(hex_str))))
    return math.degrees(math.atan2(lab[2], lab[1])) % 360


def _oklch_to_linear(L, C, H):
    h = math.radians(H)
    return _mul(M1i, tuple(x ** 3 for x in _mul(M2i, (L, C * math.cos(h), C * math.sin(h)))))


def _in_gamut(lin, eps=1e-4):
    return all(-eps <= c <= 1 + eps for c in lin)


def _max_chroma(L, H):
    lo, hi = 0.0, 0.45
    for _ in range(40):
        mid = (lo + hi) / 2
        if _in_gamut(_oklch_to_linear(L, mid, H)):
            lo = mid
        else:
            hi = mid
    return lo


def lstar(hex_str):
    """CIE L* — the definition of a tone, and what a step number names."""
    lin = _to_linear(hex_str)
    y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    return 116 * y ** (1 / 3) - 16 if y > 0.008856 else 903.3 * y


def contrast(a, b):
    def rl(hex_str):
        lin = _to_linear(hex_str)
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    lo, hi = sorted((rl(a), rl(b)))
    return (hi + 0.05) / (lo + 0.05)


# --- the grid ---------------------------------------------------------------
TARGET = {100: 92, 200: 80, 300: 70, 400: 58, 500: 48, 600: 34, 700: 18}
HUE_STEPS = list(TARGET)
STATUS_STEPS = [100, 200, 300, 500, 700]
CHROMA = 0.92  # of the gamut edge; the factory theme sits about here
# Status is quieter than the eight, so a warning never reads as a colour someone
# picked. The inks (300/500) take a share of the gamut edge; the surfaces
# (wash 100/700, fill 200) take the SAME absolute OKLCH chroma for all three, so
# no status looks faded beside another. The fill sits a shade above the grid's
# 200 so a yellow block still reads yellow (within the 4 L* the suite allows).
STATUS_TARGET = {**TARGET, 200: 82}
STATUS_CHROMA = {300: 0.8, 500: 0.85}
STATUS_SURFACE = {100: 0.034, 200: 0.111, 700: 0.034}
# How far below the grid a surface may darken to reach its chroma: a pale red
# cannot hold 0.111 at L*82, and gets there closer at L*78.
SURFACE_SLACK = 2


def step(H, target, chroma=CHROMA):
    """The colour at hue H whose CIE L* is `target`, as saturated as the gamut
    allows. L* is measured on the ROUNDED hex, because that is what ships."""
    lo, hi, best = 0.0, 1.0, None
    for _ in range(60):
        Lm = (lo + hi) / 2
        lin = _oklch_to_linear(Lm, _max_chroma(Lm, H) * chroma, H)
        best = _to_hex(lin)
        if lstar(best) < target:
            lo = Lm
        else:
            hi = Lm
    log.debug("H%3.0f  L*%2d -> %s (%.1f)", H, target, best, lstar(best))
    return best


def family(H, steps=HUE_STEPS):
    return {s: step(H, TARGET[s]) for s in steps}


def at_chroma(H, target, C):
    """The colour at hue H and CIE L* `target` with absolute OKLCH chroma C,
    or as close to C as the gamut allows there."""
    lo, hi, best = 0.0, 1.0, None
    for _ in range(60):
        Lm = (lo + hi) / 2
        best = _to_hex(_oklch_to_linear(Lm, min(C, _max_chroma(Lm, H) * 0.99), H))
        if lstar(best) < target:
            lo = Lm
        else:
            hi = Lm
    return best


def surface(H, s):
    """A status surface: its chroma at its tone, or — when the hue cannot hold
    it that light — one L* darker at a time, down to the slack."""
    C = STATUS_SURFACE[s]
    floor = TARGET[s] - SURFACE_SLACK
    for tone in range(STATUS_TARGET[s], floor - 1, -1):
        if _max_chroma(_bisect_tone(H, tone), H) * 0.99 >= C:
            return at_chroma(H, tone, C)
    return at_chroma(H, floor, C)


def _bisect_tone(H, target):
    """The OKLab lightness of the greyest colour at hue H with CIE L* `target`."""
    lo, hi = 0.0, 1.0
    for _ in range(40):
        Lm = (lo + hi) / 2
        if lstar(_to_hex(_oklch_to_linear(Lm, 0.0, H))) < target:
            lo = Lm
        else:
            hi = Lm
    return (lo + hi) / 2


def status_family(H):
    fam = {s: step(H, STATUS_TARGET[s], chroma=STATUS_CHROMA[s]) for s in STATUS_CHROMA}
    fam.update({s: surface(H, s) for s in STATUS_SURFACE})
    return {s: fam[s] for s in STATUS_STEPS}


def grey(steps=HUE_STEPS):
    return {s: step(0, TARGET[s], chroma=0.0) for s in steps}


# The factory hues, by slot — what a slot you do not mention keeps.
FACTORY = {"1": 248, "2": 298, "3": 340, "4": 25, "5": 58, "6": 95, "7": 158}
SEEDS = {"danger": "4", "warning": "6", "success": "7"}

FLOORS = [(200, "ground", 7.0), (300, "ground", 4.5), (500, "paper", 4.5), (600, "paper", 7.0)]


def check(theme, paper, ground):
    """What the app's own suite will measure. Warn here rather than let someone
    ship a theme whose headings vanish on one of the two grounds."""
    bad = []
    for name, steps in theme.items():
        for s, hex_str in steps.items():
            drift = abs(lstar(hex_str) - TARGET[s])
            if drift > 4:
                bad.append(f"{name}-{s}: tone off by {drift:.1f} L*")
        for s, against, floor in FLOORS:
            if s not in steps:
                continue
            got = contrast(steps[s], paper if against == "paper" else ground)
            if got < floor:
                bad.append(f"{name}-{s}: {got:.2f}:1 on the {against}, under {floor}:1")
    return bad


def render(name, theme, paper, ground, paper_tint, ground_tint, gray):
    out = [f"/* {name} — a Jott theme. Written by src/styles/themes/make-theme.py.",
           "   Colours run seven steps (100 pale -> 700 deep) on one tone grid; the",
           "   modes decide which step goes where. Status runs five. Edit and save —",
           "   the app repaints. */",
           ":root {",
           f"  --theme-color-white: {paper};",
           f"  --theme-color-white-tint: {paper_tint};",
           f"  --theme-color-black: {ground};",
           f"  --theme-color-black-tint: {ground_tint};",
           f"  --theme-color-gray: {gray};",
           ""]
    for slot in list(FACTORY) + ["neutral"]:
        for s in HUE_STEPS:
            out.append(f"  --theme-color-{slot}-{s}: {theme[slot][s]};")
        out.append("")
    for status in SEEDS:
        for s in STATUS_STEPS:
            out.append(f"  --theme-color-{status}-{s}: {theme[status][s]};")
        out.append("")
    out.append("}")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", default="my theme")
    ap.add_argument("-o", "--out", help="write here instead of stdout")
    ap.add_argument("--paper", default="#fbfbfb", help="the light ground")
    ap.add_argument("--ground", default="#1e1e1e", help="the dark ground")
    ap.add_argument("--paper-tint", help="one step off the paper (default: derived)")
    ap.add_argument("--ground-tint", help="one step off the dark ground (default: derived)")
    ap.add_argument("--gray", default="#a39f9b", help="the warm grey used at low alpha")
    for slot in FACTORY:
        ap.add_argument(f"--{slot}", metavar="HEX", help=f"a colour for slot {slot}")
    ap.add_argument("--check", metavar="FILE", help="measure an existing theme and exit")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.debug or os.environ.get("DEBUG") == "1"
                        else logging.INFO, format="%(levelname)s %(message)s", stream=sys.stderr)

    if args.check:
        css = open(args.check).read()
        found = {}
        for m in re.finditer(r"--theme-color-([a-z0-9][a-z0-9-]*?)-(\d00):\s*(#[0-9a-fA-F]{6})", css):
            found.setdefault(m.group(1), {})[int(m.group(2))] = m.group(3).lower()
        paper = re.search(r"--theme-color-white:\s*(#[0-9a-fA-F]{6})", css)
        ground = re.search(r"--theme-color-black:\s*(#[0-9a-fA-F]{6})", css)
        bad = check(found, paper.group(1) if paper else "#fbfbfb",
                    ground.group(1) if ground else "#1e1e1e")
        for b in bad:
            log.warning(b)
        log.info("%s: %d families, %d problems", args.check, len(found), len(bad))
        return 1 if bad else 0

    theme = {}
    for slot, default_hue in FACTORY.items():
        given = getattr(args, slot)
        H = hue_of(given) if given else default_hue
        if given:
            log.info("slot %s: hue %.0f from %s", slot, H, given)
        theme[slot] = family(H)
    theme["neutral"] = grey()
    for status, seed in SEEDS.items():
        given = getattr(args, seed)
        H = hue_of(given) if given else FACTORY[seed]
        theme[status] = status_family(H)

    # A tint is the ground one step in, not a colour anyone should have to pick.
    paper_tint = args.paper_tint or _to_hex([c * 0.94 for c in _to_linear(args.paper)])
    ground_tint = args.ground_tint or _to_hex([min(1.0, c * 1.9 + 0.008)
                                               for c in _to_linear(args.ground)])

    bad = check(theme, args.paper, args.ground)
    for b in bad:
        log.warning(b)
    if bad:
        log.warning("%d step(s) miss a floor the app's suite enforces — usually a hue "
                    "that cannot be both dark and saturated (yellow, always). The theme "
                    "is still written; the colours to move are named above.", len(bad))

    css = render(args.name, theme, args.paper, args.ground, paper_tint, ground_tint, args.gray)
    if args.out:
        with open(args.out, "w") as fh:
            fh.write(css)
        log.info("wrote %s (%d tokens)", args.out, css.count("--theme-color-"))
    else:
        sys.stdout.write(css)
    return 0


if __name__ == "__main__":
    sys.exit(main())
