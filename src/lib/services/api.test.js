// The bridge's error path — the one thing in api.js that decides anything.
//
// Everything else here is a name for a Rust command; what is tested is what
// the shell shows when one of them fails, because the banner used to be able
// to say `[object Object]` (user report on device, 2026-08-31) and there is
// no report to act on in six words that name neither the failure nor the call.

import { beforeEach, describe, expect, it } from "vitest";
import { bridge, resetBridge } from "../test/bridge.js";

/// Rejects with the value itself, not with an `Error` wrapping it: what is
/// under test is exactly what the bridge does with a shape that is not one.
const rejects = (value) => () => Promise.reject(value);
import { api, describeError } from "./api.js";

beforeEach(resetBridge);

describe("describeError", () => {
  it("reads the core's own shape", () => {
    expect(describeError({ kind: "io", message: "/x: permission denied" })).toBe(
      "io: /x: permission denied",
    );
  });

  it("reads anything that can say what it is", () => {
    expect(describeError(new Error("boom"))).toBe("Error: boom");
    expect(describeError("plain string")).toBe("plain string");
    expect(describeError(null)).toBe("null");
  });

  // The regression itself: a plain object has no `toString` worth printing,
  // and `String()` answers the same six words for every one of them.
  it("never answers [object Object]", () => {
    expect(describeError({})).toBe("{}");
    expect(describeError({ postNotification: "denied" })).toBe(
      '{"postNotification":"denied"}',
    );
    expect(describeError({ message: "no permission" })).toBe("no permission");
  });

  it("survives an object that cannot be read at all", () => {
    const circular = {};
    circular.self = circular;
    expect(describeError(circular)).toBe("unreadable error");
  });
});

describe("a failing command", () => {
  it("says which one it was", async () => {
    bridge({ notebook_snapshot: rejects({ kind: "io", message: "gone" }) });
    await expect(api.notebookSnapshot()).rejects.toMatchObject({
      command: "notebook_snapshot",
    });
    const caught = await api.notebookSnapshot().catch((e) => e);
    expect(describeError(caught)).toBe("io: gone (notebook_snapshot)");
  });

  it("names the command even when the failure has no shape of its own", async () => {
    bridge({ reminders: rejects({}) });
    const caught = await api.reminders().catch((e) => e);
    expect(describeError(caught)).toBe('{"command":"reminders"} (reminders)');
  });

  // `kind` is what the shell branches on — Ctrl+Z warns instead of failing
  // when the notebook moved underneath it — so annotating must not reshape.
  it("keeps the kind the shell branches on", async () => {
    bridge({ undo: rejects({ kind: "stale", message: "moved" }) });
    const caught = await api.undo().catch((e) => e);
    expect(caught.kind).toBe("stale");
  });
});
