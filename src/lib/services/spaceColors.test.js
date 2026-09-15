import { describe, it, expect } from "vitest";
import {
  dealtColors,
  groupColors,
  nextRainbowColor,
  rainbowFrom,
  spaceColors,
} from "./spaceColors.js";

describe("spaceColors", () => {
  const spaces = [
    { path: "Space 1", color: "#ff0000" },
    { path: "Space 2", color: null },
    { path: "Space 3", color: "#00ff00" },
  ];

  it("keeps a loose space's own colour", () => {
    expect(spaceColors(spaces, [])["Space 1"]).toBe("#ff0000");
    expect(spaceColors(spaces, [])["Space 2"]).toBe(null);
  });

  it("makes a grouped space follow the group, not its old colour", () => {
    const groups = [{ folder: "Work", color: "#0000ff", spaces: ["Space 1"] }];
    const colors = spaceColors(spaces, groups);
    expect(colors["Space 1"]).toBe("#0000ff");
    expect(colors["Space 3"]).toBe("#00ff00");
  });

  it("wears the rainbow from the accent on, ignoring what was chosen", () => {
    // Blue Topaz: the fixed spaces wear the accent, the column below goes
    // around the seven from the hue after it, one per top-level entry in
    // sidebar order — a hand-picked red is overruled, a grouped space
    // follows its group's band, and the eighth entry wraps around.
    const many = Array.from({ length: 9 }, (_, i) => ({ path: `S${i}`, color: null }));
    many[1].color = "4";
    const fixed = { path: "jott.tasks", fixed: true, color: null };
    const groups = [{ folder: "Work", spaces: ["S3"] }];
    const opts = { rainbow: true, accent: "1" };
    const colors = spaceColors([fixed, ...many], groups, opts);
    expect(colors["jott.tasks"]).toBe("1");
    expect(colors.S0).toBe("2");
    expect(colors.S1).toBe("3");
    expect(colors.S2).toBe("4");
    expect(groupColors([fixed, ...many], groups, opts).Work).toBe("5");
    expect(colors.S3).toBe("5");
    expect(colors.S4).toBe("6");
    expect(colors.S5).toBe("7");
    expect(colors.S6).toBe("neutral", "neutral closes every lap");
    expect(colors.S7).toBe("1");
    // Off, nothing is dealt — what was set is what there is.
    expect(spaceColors(many, groups).S1).toBe("4");
    expect(groupColors(many, groups).Work).toBe(null);
  });

  it("starts the rainbow from the app's own accent when none of the seven is chosen", () => {
    expect(rainbowFrom("neutral")[0]).toBe("1");
    expect(rainbowFrom(null)[0]).toBe("1");
    expect(rainbowFrom("7")).toEqual([
      "7", "1", "2", "3", "4", "5", "6", "neutral",
    ]);
  });

  it("drops the member's colour when the group has none", () => {
    // Otherwise joining a colourless group would leave the tab dot and the
    // title on the colour the space had while loose.
    const groups = [{ folder: "Work", spaces: ["Space 1"] }];
    expect(spaceColors(spaces, groups)["Space 1"]).toBe(null);
  });
});

describe("leaving the rainbow", () => {
  const spaces = [
    { path: "jott.tasks", fixed: true, color: null },
    { path: "Mercado", color: null },
    { path: "Casa", color: null },
    { path: "Acme", color: "4" },
  ];
  const groups = [{ folder: "Work", spaces: ["Acme"] }];
  const opts = { rainbow: true, accent: "1" };

  it("writes down what the column was showing, and only what owns a colour", () => {
    const { spaces: sp, groups: gr } = dealtColors(spaces, groups, opts);
    // A group sits where its members sit, so this one closes the column.
    expect(gr).toEqual({ Work: "4" });
    // The fixed space is left out — its dealt colour is the accent, which is
    // what wearing none already means — and so is the grouped one.
    expect(sp).toEqual({ Mercado: "2", Casa: "3" });
  });

  it("deals nothing when the rainbow is off: what is written is what there is", () => {
    const { spaces: sp } = dealtColors(spaces, groups, { rainbow: false });
    expect(sp).toEqual({ Mercado: null, Casa: null });
  });
});

describe("the colour a new entry is born wearing", () => {
  it("is the one after the last top-level entry's", () => {
    const spaces = [
      { path: "jott.tasks", fixed: true, color: null },
      { path: "Mercado", color: "3" },
      { path: "Casa", color: "6" },
    ];
    expect(nextRainbowColor(spaces, [], "1")).toBe("7");
  });

  it("wraps past neutral, which closes every lap", () => {
    const spaces = [{ path: "Casa", color: "neutral" }];
    expect(nextRainbowColor(spaces, [], "1")).toBe("1");
  });

  it("counts a group as an entry, and reads the one it wears", () => {
    const spaces = [{ path: "Work/Acme", color: null }];
    const groups = [{ folder: "Work", color: "5", spaces: ["Work/Acme"] }];
    expect(nextRainbowColor(spaces, groups, "1")).toBe("6");
  });

  it("lets the POSITION answer when the last entry wears nothing the app knows", () => {
    // A hand-written `#rrggbb`, or nothing at all: the deal would have given
    // the new entry the hue for its place in the column, so that is the one.
    const two = [{ path: "A", color: "#ff0000" }, { path: "B", color: null }];
    expect(nextRainbowColor(two, [], "1")).toBe("4");
    expect(nextRainbowColor([], [], "1")).toBe("2");
  });

  it("reads a colour an older build named instead of numbered", () => {
    expect(nextRainbowColor([{ path: "A", color: "orange" }], [], "1")).toBe("6");
  });
});
