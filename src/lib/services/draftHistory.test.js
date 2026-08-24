import { describe, expect, test } from "vitest";
import { changedField, draftHistory } from "./draftHistory.js";

const snap = (o) => JSON.stringify(o);

describe("draftHistory", () => {
  test("starts with nothing to undo and walks back one change at a time", () => {
    const h = draftHistory({ now: () => 0 });
    h.reset(snap({ text: "a" }));
    expect(h.canUndo()).toBe(false);
    expect(h.undo()).toBeNull();

    h.push(snap({ text: "b" }), "text");
    h.push(snap({ text: "b", due: "2026-01-01" }), "due");
    expect(h.undo()).toBe(snap({ text: "b" }));
    expect(h.undo()).toBe(snap({ text: "a" }));
    expect(h.undo()).toBeNull();
  });

  test("redo brings the change back, and a new change forgets the redo", () => {
    const h = draftHistory({ now: () => 0 });
    h.reset(snap({ text: "a" }));
    h.push(snap({ text: "b" }), "text");
    h.undo();
    expect(h.canRedo()).toBe(true);
    expect(h.redo()).toBe(snap({ text: "b" }));
    expect(h.redo()).toBeNull();

    h.undo();
    h.push(snap({ text: "c" }), "text");
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe(snap({ text: "a" }));
  });

  test("typing into one field within the merge window is one step", () => {
    let t = 0;
    const h = draftHistory({ merge: 500, now: () => t });
    h.reset(snap({ text: "" }));
    for (const typed of ["h", "he", "hel", "hell", "hello"]) {
      t += 100;
      h.push(snap({ text: typed }), "text");
    }
    expect(h.undo()).toBe(snap({ text: "" }));
    expect(h.canUndo()).toBe(false);
  });

  test("a pause, or another field, starts a new step", () => {
    let t = 0;
    const h = draftHistory({ merge: 500, now: () => t });
    h.reset(snap({ text: "", priority: "" }));
    h.push(snap({ text: "a", priority: "" }), "text");
    t = 2000;
    h.push(snap({ text: "ab", priority: "" }), "text");
    t = 2100;
    h.push(snap({ text: "ab", priority: "2" }), "priority");
    expect(h.undo()).toBe(snap({ text: "ab", priority: "" }));
    expect(h.undo()).toBe(snap({ text: "a", priority: "" }));
    expect(h.undo()).toBe(snap({ text: "", priority: "" }));
  });

  test("an undo's own snapshot does not land back in the history", () => {
    const h = draftHistory({ now: () => 0 });
    h.reset(snap({ text: "a" }));
    h.push(snap({ text: "b" }), "text");
    const back = h.undo();
    // The inspector's effect sees the reverted draft and offers it again.
    h.push(back, "text");
    expect(h.canRedo()).toBe(true);
    expect(h.canUndo()).toBe(false);
  });

  test("keeps at most `limit` steps", () => {
    const h = draftHistory({ limit: 3, now: () => 0 });
    h.reset(snap({ n: 0 }));
    for (let n = 1; n <= 10; n++) h.push(snap({ n }), null);
    let steps = 0;
    while (h.undo() !== null) steps++;
    expect(steps).toBe(3);
  });
});

describe("changedField", () => {
  test("names the one field that differs", () => {
    expect(changedField(snap({ a: 1, b: [1] }), snap({ a: 1, b: [1, 2] }))).toBe("b");
  });

  test("answers null for none, for several, and for non-JSON", () => {
    expect(changedField(snap({ a: 1 }), snap({ a: 1 }))).toBeNull();
    expect(changedField(snap({ a: 1, b: 2 }), snap({ a: 2, b: 3 }))).toBeNull();
    expect(changedField("{", snap({ a: 1 }))).toBeNull();
  });
});
