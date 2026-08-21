// The one shape every change takes. It had no test of its own: what it does is
// an ORDER, and the order is the reason it exists.

import { describe, expect, test, vi } from "vitest";
import { makeAct, makeLoad, makeScreen } from "./act.js";

describe("makeAct", () => {
  test("does the thing, re-reads, tells the shell — in that order", async () => {
    const seen = [];
    const act = makeAct({
      load: () => seen.push("load"),
      onChanged: () => seen.push("changed"),
      onError: () => seen.push("error"),
    });

    await act(() => seen.push("do"));

    expect(seen).toEqual(["do", "load", "changed"]);
  });

  test("`after` runs on the reloaded screen, with what the change answered", async () => {
    // The reason it exists: opening the space that was just created has to
    // happen once the snapshot carries it, or the screen renders "missing".
    const seen = [];
    const act = makeAct({ load: () => seen.push("load") });

    await act(
      () => "Design/Tasks",
      (folder) => seen.push(`open ${folder}`),
    );

    expect(seen).toEqual(["load", "open Design/Tasks"]);
  });

  test("a failure goes to the banner, and nothing after it happens", async () => {
    const load = vi.fn();
    const after = vi.fn();
    const errors = [];
    const act = makeAct({ load, onError: (e) => errors.push(e) });

    await act(() => {
      throw { kind: "io", message: "nope" };
    }, after);

    expect(errors).toEqual([{ kind: "io", message: "nope" }]);
    // Neither the reload nor the follow-up: the change did not happen.
    expect(load).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  test("a screen that only reads still gets the error routing", async () => {
    const errors = [];
    const act = makeAct({ onError: (e) => errors.push(e) });
    await act(() => {
      throw "boom";
    });
    expect(errors).toEqual(["boom"]);
  });
});

describe("makeLoad", () => {
  test("reads, applies, and reports a failure the same way", async () => {
    const applied = [];
    const errors = [];
    await makeLoad({ read: () => [1, 2], apply: (v) => applied.push(v) })();
    expect(applied).toEqual([[1, 2]]);

    await makeLoad({
      read: () => {
        throw "boom";
      },
      apply: () => applied.push("never"),
      onError: (e) => errors.push(e),
    })();
    expect(errors).toEqual(["boom"]);
    expect(applied).toEqual([[1, 2]]);
  });
});

describe("makeScreen", () => {
  test("the act it builds reloads through the load it builds", async () => {
    const seen = [];
    const { load, act } = makeScreen({
      read: () => "fresh",
      apply: (v) => seen.push(`apply ${v}`),
      onChanged: () => seen.push("changed"),
    });

    await load();
    expect(seen).toEqual(["apply fresh"]);

    await act(() => seen.push("do"));
    expect(seen).toEqual(["apply fresh", "do", "apply fresh", "changed"]);
  });

  test("one onError serves both halves", async () => {
    const errors = [];
    const { load, act } = makeScreen({
      read: () => {
        throw "read failed";
      },
      apply: () => {},
      onError: (e) => errors.push(e),
    });
    await load();
    await act(() => {
      throw "act failed";
    });
    expect(errors).toEqual(["read failed", "act failed"]);
  });
});
