import { afterEach, describe, expect, it, vi } from "vitest";
import { segmented } from "./segmented.js";

/// A track with two items, laid out by hand: jsdom measures nothing, so the
/// offsets are what the test says they are.
function track({ measured = true } = {}) {
  document.body.innerHTML = `
    <nav class="theme-segmented">
      <button class="theme-segmented__item theme-segmented__item--active">Inbox</button>
      <button class="theme-segmented__item">This week</button>
    </nav>`;
  const node = document.querySelector(".theme-segmented");
  const [a, b] = node.querySelectorAll("button");
  if (measured) {
    lay(a, { left: 2, width: 60 });
    lay(b, { left: 66, width: 90 });
  }
  return { node, a, b };
}

function lay(el, { left, width, top = 2, height = 28 }) {
  Object.defineProperties(el, {
    offsetLeft: { value: left, configurable: true },
    offsetTop: { value: top, configurable: true },
    offsetWidth: { value: width, configurable: true },
    offsetHeight: { value: height, configurable: true },
  });
}

/// MutationObserver delivers on a microtask.
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
});

describe("segmented", () => {
  it("draws the pill over the active item, as soon as it is mounted", () => {
    const { node } = track();
    segmented(node);
    expect(node.classList.contains("theme-segmented--glides")).toBe(true);
    expect(node.style.getPropertyValue("--seg-x")).toBe("2px");
    expect(node.style.getPropertyValue("--seg-w")).toBe("60px");
  });

  it("moves the pill when the active class changes hands", async () => {
    const { node, a, b } = track();
    segmented(node);
    a.classList.remove("theme-segmented__item--active");
    b.classList.add("theme-segmented__item--active");
    await settle();
    expect(node.style.getPropertyValue("--seg-x")).toBe("66px");
    expect(node.style.getPropertyValue("--seg-w")).toBe("90px");
  });

  // Without layout there is nothing to measure, and a pill of zero width
  // drawn over a solid item would be the item losing its colour for nothing.
  it("leaves the item solid where nothing can be measured", () => {
    const { node } = track({ measured: false });
    segmented(node);
    expect(node.classList.contains("theme-segmented--glides")).toBe(false);
  });

  it("takes the pill away when no item is active any more", async () => {
    const { node, a } = track();
    segmented(node);
    a.classList.remove("theme-segmented__item--active");
    await settle();
    expect(node.classList.contains("theme-segmented--glides")).toBe(false);
  });

  it("stops watching on destroy", async () => {
    const { node, a, b } = track();
    const action = segmented(node);
    action.destroy();
    a.classList.remove("theme-segmented__item--active");
    b.classList.add("theme-segmented__item--active");
    await settle();
    expect(node.style.getPropertyValue("--seg-x")).toBe("2px");
  });

  it("survives an engine with no ResizeObserver", () => {
    const saved = globalThis.ResizeObserver;
    vi.stubGlobal("ResizeObserver", undefined);
    const { node } = track();
    expect(() => segmented(node).destroy()).not.toThrow();
    vi.stubGlobal("ResizeObserver", saved);
  });
});
