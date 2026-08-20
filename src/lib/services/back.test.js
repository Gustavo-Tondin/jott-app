import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onBack, back, installBack } from "./back.js";

// The stack is module state, so every test tears down what it registered —
// a handler left behind answers for the next test.
let off = [];
const register = (fn) => off.push(onBack(fn));

afterEach(() => {
  off.forEach((fn) => fn());
  off = [];
});

describe("the back stack", () => {
  it("answers false when nobody is listening", () => {
    expect(back()).toBe(false);
  });

  it("asks the most recent handler first", () => {
    const asked = [];
    register(() => (asked.push("first"), false));
    register(() => (asked.push("second"), true));

    expect(back()).toBe(true);
    expect(asked).toEqual(["second"]);
  });

  it("falls through a handler that declines", () => {
    const asked = [];
    register(() => (asked.push("shell"), true));
    register(() => (asked.push("dialog"), false));

    expect(back()).toBe(true);
    expect(asked).toEqual(["dialog", "shell"]);
  });

  // A component that has gone must stop answering, or a closed dialog keeps
  // swallowing the press and the app can never be left.
  it("forgets a handler once it unregisters", () => {
    const gone = onBack(() => true);
    gone();
    expect(back()).toBe(false);
  });

  // The app closing because a menu threw is the worse outcome of the two.
  it("keeps asking after one throws", () => {
    register(() => true);
    register(() => {
      throw new Error("boom");
    });
    expect(back()).toBe(true);
  });
});

describe("what the platform asks", () => {
  let stop;
  afterEach(() => stop?.());

  // MainActivity reaches this through evaluateJavascript, which sees no
  // modules and no Svelte — it has to be a plain function on `window`.
  it("hangs the answer on window for the Activity to call", () => {
    stop = installBack();
    register(() => true);
    expect(typeof window.__jottBack).toBe("function");
    expect(window.__jottBack()).toBe(true);
  });

  it("takes it back down again", () => {
    installBack()();
    expect(window.__jottBack).toBeUndefined();
  });

  it("answers the mouse's fourth button, and only that one", () => {
    const taken = [];
    stop = installBack();
    register(() => (taken.push("back"), true));

    for (const button of [0, 1, 2, 3]) {
      window.dispatchEvent(new MouseEvent("mouseup", { button, bubbles: true }));
    }
    expect(taken).toEqual(["back"]);
  });

  it("answers the fifth with forward", () => {
    const onForward = vi.fn();
    stop = installBack({ onForward });
    window.dispatchEvent(new MouseEvent("mouseup", { button: 4, bubbles: true }));
    expect(onForward).toHaveBeenCalledOnce();
  });

  // Acting on the press as well as the release would fire twice; cancelling
  // the press is only so nothing else can claim it.
  it("cancels the press without acting on it", () => {
    const taken = [];
    stop = installBack();
    register(() => (taken.push("back"), true));

    const down = new MouseEvent("mousedown", { button: 3, bubbles: true, cancelable: true });
    window.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(taken).toEqual([]);
  });
});
