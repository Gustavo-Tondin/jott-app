// Which parts of the app are switched on.
//
// Three rules live here and nowhere else, and each is easy to get wrong at a
// call site: a feature has its own default, a child follows its parent, and a
// switch back at its default is forgotten rather than written.

import { describe, expect, test } from "vitest";
import {
  FEATURES,
  on,
  defaultOf,
  stored,
  reader,
} from "./features.js";

describe("on", () => {
  test("with nothing said, a feature is however it ships", () => {
    expect(on({}, "tasks")).toBe(true);
    expect(on(undefined, "repeat")).toBe(true);
    // The four that ship OFF (user call, 2026-08-06). `remind` left on
    // 2026-08-21 — a switch that only turned on a disabled button — and came
    // back with its backend on 2026-08-25.
    for (const key of ["week", "description", "files", "remind"]) {
      expect(on({}, key), key).toBe(false);
    }
    // A key this build has never heard of is ON: an older notebook must not be
    // able to switch something off by not mentioning it.
    expect(on({}, "invented-tomorrow")).toBe(true);
  });

  test("hiding the fixed Tasks screen switches My Day and Week off with it", () => {
    // `needs` (user call, 2026-08-24): both period views are that screen's
    // tabs, and hiding the screen is choosing a life without them. Saying
    // "week: true" does not resurrect it while the screen is hidden.
    expect(on({ tasksSpace: false }, "myDay")).toBe(false);
    expect(on({ tasksSpace: false, week: true }, "week")).toBe(false);
    expect(on({ fixedSpaces: false }, "myDay")).toBe(false);
    // The tasks FUNCTION itself stays on: user spaces keep working.
    expect(on({ tasksSpace: false }, "tasks")).toBe(true);
  });

  test("the user's word beats the default, in both directions", () => {
    expect(on({ week: true }, "week")).toBe(true);
    expect(on({ repeat: false }, "repeat")).toBe(false);
  });

  test("switching one off leaves its siblings alone", () => {
    const features = { repeat: false };
    expect(on(features, "repeat")).toBe(false);
    expect(on(features, "priority")).toBe(true);
    expect(on(features, "tasks")).toBe(true);
  });

  test("a child follows its parent, whatever the file says about the child", () => {
    // With tasks off there is no priority to speak of, even though nobody
    // switched priority off.
    const features = { tasks: false };
    expect(on(features, "priority")).toBe(false);
    expect(on(features, "myDay")).toBe(false);
    // And the other half of the app is untouched.
    expect(on(features, "notes")).toBe(true);
  });

  test("a child switched on under a parent switched off stays off", () => {
    expect(on({ tasks: false, repeat: true }, "repeat")).toBe(false);
  });

  test("anything that is not a boolean is not an opinion", () => {
    // The core only ever writes booleans, but a hand-edited file can say
    // anything, and it must fall back to the default rather than be read as
    // "off" by accident.
    expect(on({ tasks: 0 }, "tasks")).toBe(true);
    expect(on({ tasks: "no" }, "tasks")).toBe(true);
    expect(on({ tasks: null }, "tasks")).toBe(true);
    expect(on({ week: "yes" }, "week")).toBe(false);
  });
});

describe("stored", () => {
  test("a switch back at its default is FORGOTTEN, not written", () => {
    // The file carries only what differs from how the app ships.
    expect(stored("repeat", true)).toBeNull();
    expect(stored("repeat", false)).toBe(false);
    // And the other way round for one that ships off.
    expect(stored("week", false)).toBeNull();
    expect(stored("week", true)).toBe(true);
  });
});

describe("defaultOf", () => {
  test("says how each one ships", () => {
    expect(defaultOf("tasks")).toBe(true);
    expect(defaultOf("week")).toBe(false);
    expect(defaultOf("anything-else")).toBe(true);
  });
});

describe("reader", () => {
  test("binds the flags once so a screen can just ask", () => {
    const f = reader({ tasks: false });
    expect(f("tasks")).toBe(false);
    expect(f("subtasks")).toBe(false);
    expect(f("notes")).toBe(true);
  });
});
describe("FEATURES", () => {
  test("every sub-option names a parent that exists", () => {
    const keys = new Set(FEATURES.map((f) => f.key));
    for (const feature of FEATURES) {
      if (feature.parent) expect(keys.has(feature.parent)).toBe(true);
    }
  });

  test("every switch has a label — the screen is built from this list", () => {
    for (const feature of FEATURES) {
      expect(typeof feature.label()).toBe("string");
      expect(feature.label().length).toBeGreaterThan(0);
    }
  });
});
