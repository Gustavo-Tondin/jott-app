import { afterEach, describe, expect, it, vi } from "vitest";
import { risen } from "./risen.js";

// jsdom has no IntersectionObserver, so the one thing this action is made of
// has to be stood up here. It keeps every instance made, so a test can fire
// the crossing by hand — which is the only way to see the flip at all.
function fakeObserver() {
  const made = [];
  class Fake {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = [];
      made.push(this);
    }
    observe(target) {
      this.targets.push(target);
    }
    disconnect() {
      this.disconnected = true;
    }
    cross(isIntersecting) {
      this.callback([{ target: this.targets[0], isIntersecting }], this);
    }
  }
  vi.stubGlobal("IntersectionObserver", Fake);
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("risen", () => {
  const canvas = () => {
    document.body.innerHTML = `<section class="centre"><div class="canvas"></div></section>`;
    return {
      root: document.querySelector(".centre"),
      node: document.querySelector(".canvas"),
    };
  };

  it("watches a probe inside the box, against the scroller", () => {
    const made = fakeObserver();
    const { root, node } = canvas();

    risen(node, { root, onRisen: () => {} });

    expect(made.length).toBe(1);
    expect(made[0].options.root).toBe(root);
    // Inside, not one pixel above it: the boxes this watches are clipped
    // (the Home's sheet, an open note), and a clipped probe never intersects.
    expect(made[0].targets[0].parentElement).toBe(node);
  });

  it("says it has risen once the top edge leaves the scroller", () => {
    const made = fakeObserver();
    const { root, node } = canvas();
    const seen = [];

    risen(node, { root, onRisen: (up) => seen.push(up) });

    made[0].cross(true);
    made[0].cross(false);
    expect(seen).toEqual([false, true]);
  });

  it("reports nothing risen where there is no observer", () => {
    const { root, node } = canvas();
    const seen = [];

    // No stub: this is jsdom, and an old engine looks the same. The action
    // must answer rather than throw — one that threw would take every action
    // mounted after it down with it.
    risen(node, { root, onRisen: (up) => seen.push(up) });

    expect(seen).toEqual([false]);
    expect(node.children.length).toBe(0);
  });

  it("draws no probe while it is turned off", () => {
    const made = fakeObserver();
    const { root, node } = canvas();

    risen(node, { root, enabled: false, onRisen: () => {} });

    expect(made.length).toBe(0);
    expect(node.children.length).toBe(0);
  });

  it("rebuilds when the scroller arrives, and not on every render", () => {
    const made = fakeObserver();
    const { root, node } = canvas();

    // The shell binds the scroller after mount, so the first observer is
    // built with none.
    const handle = risen(node, { root: null, onRisen: () => {} });
    expect(made.length).toBe(1);

    handle.update({ root, onRisen: () => {} });
    expect(made.length).toBe(2);
    expect(made[0].disconnected).toBe(true);
    expect(made[1].options.root).toBe(root);

    // A fresh options object every render is not a reason to tear down.
    handle.update({ root, onRisen: () => {} });
    expect(made.length).toBe(2);
  });

  it("answers with the callback it was last given", () => {
    const made = fakeObserver();
    const { root, node } = canvas();
    const seen = [];

    const handle = risen(node, { root, onRisen: () => seen.push("old") });
    handle.update({ root, onRisen: () => seen.push("new") });
    made[0].cross(false);

    expect(seen).toEqual(["new"]);
  });

  it("takes the probe with it when it goes", () => {
    const made = fakeObserver();
    const { root, node } = canvas();

    const handle = risen(node, { root, onRisen: () => {} });
    handle.destroy();

    expect(made[0].disconnected).toBe(true);
    expect(node.children.length).toBe(0);
  });
});
