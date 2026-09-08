// The window a "just arrived" mark lives in (services/recent.js). What it has
// to survive is the SECOND read: every write is answered by a reload and then
// by the file watcher's own, a few frames apart.
import { describe, expect, test } from "vitest";
import { tracker, HELD } from "./recent.js";

describe("recent — what has just appeared", () => {
  test("the first read of a source marks nothing", () => {
    const sift = tracker();
    expect([...sift("day", ["a", "b"], 0)]).toEqual([]);
  });

  test("a key the last read did not hold is marked", () => {
    const sift = tracker();
    sift("day", ["a"], 0);
    expect([...sift("day", ["a", "b"], 10)]).toEqual(["b"]);
  });

  test("the mark survives the reads that follow, inside the window", () => {
    const sift = tracker();
    sift("day", ["a"], 0);
    sift("day", ["a", "b"], 10);
    // The watcher's reload, three frames later: nothing is new, and the mark
    // must not be taken away mid-play.
    expect([...sift("day", ["a", "b"], 60)]).toEqual(["b"]);
    expect([...sift("day", ["a", "b"], HELD + 20)]).toEqual([]);
  });

  test("another source is another list, and marks nothing", () => {
    const sift = tracker();
    sift("2026-09-08", ["a"], 0);
    expect([...sift("2026-09-09", ["c", "d"], 10)]).toEqual([]);
    // And what was held for the old one goes with it.
    expect([...sift("2026-09-09", ["c", "d", "e"], 20)]).toEqual(["e"]);
  });
});
