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

  // The Tasks strip is rebuilt by the very click it answers (TasksView's
  // `{#key sub}`), so its pill has no past to travel from — it lands on the
  // new tab already there. The memory is what gives the new track the old
  // track's last spot to start from.
  describe("a track that is rebuilt on every click", () => {
    it("starts the new pill where the old one ended", () => {
      const memory = {};
      const first = track();
      segmented(first.node, { memory }).destroy();
      expect(memory.at).toEqual({ x: 2, y: 2, w: 60, h: 28 });

      // The rebuild: a brand-new nav, with the OTHER item active.
      const next = track();
      next.a.classList.remove("theme-segmented__item--active");
      next.b.classList.add("theme-segmented__item--active");
      const painted = [];
      const write = next.node.style.setProperty.bind(next.node.style);
      next.node.style.setProperty = (name, value) => {
        if (name === "--seg-x") painted.push(value);
        write(name, value);
      };
      segmented(next.node, { memory });

      // Twice: the remembered spot first, so the browser has a value to
      // transition FROM, then the real one.
      expect(painted).toEqual(["2px", "66px"]);
      expect(next.node.style.getPropertyValue("--seg-x")).toBe("66px");
      expect(memory.at.x).toBe(66);
    });

    it("does not flash when the rebuild changes nothing", () => {
      const memory = {};
      segmented(track().node, { memory }).destroy();
      const next = track();
      const painted = [];
      const write = next.node.style.setProperty.bind(next.node.style);
      next.node.style.setProperty = (name, value) => {
        if (name === "--seg-x") painted.push(value);
        write(name, value);
      };
      segmented(next.node, { memory });
      expect(painted).toEqual(["2px"]);
    });

    it("leaves a track without a memory exactly as it was", () => {
      const { node } = track();
      segmented(node);
      expect(node.style.getPropertyValue("--seg-x")).toBe("2px");
      expect(node.classList.contains("theme-segmented--glides")).toBe(true);
    });
  });

  // The Home's week strip is not a segmented control — it borrows the
  // movement without wearing the class, or it would be a modifier with no
  // base (an architecture test refuses that).
  it("takes the active item and the class it writes from the caller", () => {
    document.body.innerHTML = `
      <ol class="day-head__days">
        <li><button class="day-head__day">8</button></li>
        <li><button class="day-head__day is-selected">9</button></li>
      </ol>`;
    const node = document.querySelector(".day-head__days");
    const [a, b] = node.querySelectorAll("button");
    lay(a, { left: 0, width: 84, top: 0, height: 84 });
    lay(b, { left: 88, width: 84, top: 0, height: 84 });

    segmented(node, { active: ".day-head__day.is-selected", glides: "day-head__days--glides" });

    expect(node.classList.contains("day-head__days--glides")).toBe(true);
    expect(node.classList.contains("theme-segmented--glides")).toBe(false);
    expect(node.style.getPropertyValue("--seg-x")).toBe("88px");
    expect(node.style.getPropertyValue("--seg-w")).toBe("84px");
  });

  // A week the chosen day is not in draws no pill at all: the strip has
  // three weeks on it and only one of them is showing a day.
  it("draws nothing on a track with no active item", () => {
    document.body.innerHTML = `
      <ol class="day-head__days"><li><button class="day-head__day">8</button></li></ol>`;
    const node = document.querySelector(".day-head__days");
    lay(node.querySelector("button"), { left: 0, width: 84, top: 0, height: 84 });
    segmented(node, { active: ".day-head__day.is-selected", glides: "day-head__days--glides" });
    expect(node.classList.contains("day-head__days--glides")).toBe(false);
  });

  it("survives an engine with no ResizeObserver", () => {
    const saved = globalThis.ResizeObserver;
    vi.stubGlobal("ResizeObserver", undefined);
    const { node } = track();
    expect(() => segmented(node).destroy()).not.toThrow();
    vi.stubGlobal("ResizeObserver", saved);
  });
});

describe("segmented, on a pill's first appearance", () => {
  // WebKit transitions a new `::before` from the initial translate: without
  // `place` every pill flies in from the track's corner.
  it("finishes the pill's own transition once, and lets a later move glide", async () => {
    const { node, a, b } = track();
    const finish = vi.fn();
    const others = vi.fn();
    node.getAnimations = () => [
      { effect: { target: node, pseudoElement: "::before" }, finish },
      { effect: { target: a, pseudoElement: null }, finish: others },
    ];
    segmented(node);
    expect(finish).toHaveBeenCalledTimes(1);

    a.classList.remove("theme-segmented__item--active");
    b.classList.add("theme-segmented__item--active");
    await settle();
    expect(node.style.getPropertyValue("--seg-x")).toBe("66px");
    expect(finish).toHaveBeenCalledTimes(1);
    expect(others).not.toHaveBeenCalled();
  });
});
