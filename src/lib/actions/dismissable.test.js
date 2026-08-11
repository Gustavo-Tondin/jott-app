// The dismiss behaviour every popup shares, tested without rendering one.
//
// These are the three details that made four hand-written copies drift, so
// they are what this guards: inside vs outside, the swallowed Escape, and the
// listeners going away when the surface closes.
import { describe, expect, test, vi } from "vitest";
import { dismissable } from "./dismissable.js";

function surface({ active = true } = {}) {
  const root = document.createElement("div");
  const inside = document.createElement("button");
  root.append(inside);
  document.body.append(root);

  const onDismiss = vi.fn();
  const handle = dismissable(root, { active, onDismiss });
  return { root, inside, onDismiss, handle };
}

function pointerDownOn(target) {
  target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
}

describe("dismissable", () => {
  test("a pointer down outside dismisses; inside does not", () => {
    const { inside, onDismiss, handle } = surface();

    pointerDownOn(inside);
    expect(onDismiss).not.toHaveBeenCalled();

    pointerDownOn(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  test("Escape dismisses, and is swallowed so nothing behind it reacts", () => {
    const { onDismiss, handle } = surface();
    // What the shell would be doing: listening for Escape to close the panel.
    const behind = vi.fn();
    document.addEventListener("keydown", behind);

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    document.body.dispatchEvent(event);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(behind).not.toHaveBeenCalled();

    document.removeEventListener("keydown", behind);
    handle.destroy();
  });

  test("another key is left alone", () => {
    const { onDismiss, handle } = surface();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", bubbles: true }),
    );
    expect(onDismiss).not.toHaveBeenCalled();
    handle.destroy();
  });

  test("inactive listens to nothing, and turning it on starts listening", () => {
    const { onDismiss, handle } = surface({ active: false });

    pointerDownOn(document.body);
    expect(onDismiss).not.toHaveBeenCalled();

    handle.update({ active: true, onDismiss });
    pointerDownOn(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  test("destroy stops listening — a closed popup must not keep firing", () => {
    const { onDismiss, handle } = surface();
    handle.destroy();

    pointerDownOn(document.body);
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
