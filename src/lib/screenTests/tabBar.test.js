// The bar of tabs.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { noop, resetScreens } from "../test/screens.js";
import TabBar from "../shell/TabBar.svelte";

beforeEach(resetScreens);

describe("TabBar", () => {
  const tab = (title) => ({ views: [{ kind: "list", list: `Tasks/${title}.md` }], at: 0 });
  const titleOf = (v) => v.list.replace("jott.tasks/", "").replace(".md", "");

  const props = (extra = {}) => ({
    tabs: [tab("Um"), tab("Dois"), tab("Tres")],
    active: 0,
    titleOf,
    onSelect: noop,
    onClose: noop,
    onMove: noop,
    ...extra,
  });

  test("closing freezes the widths so the next × lands under the pointer", async () => {
    // The browser behaviour worth copying: closing several tabs in a row is
    // one gesture instead of a hunt.
    const closed = [];
    const { container } = render(TabBar, {
      props: props({ onClose: (i) => closed.push(i) }),
    });

    await userEvent.click(screen.getAllByLabelText("close tab")[1]);

    expect(closed).toEqual([1]);
    const widths = [...container.querySelectorAll(".tabs__item")].map((el) => el.style.width);
    expect(widths.every((w) => w !== "")).toBe(true);

    // Leaving the bar releases them, so the tabs breathe again.
    await fireEvent.mouseLeave(container.querySelector(".tabs"));
    const after = [...container.querySelectorAll(".tabs__item")].map((el) => el.style.width);
    expect(after.every((w) => w === "")).toBe(true);
  });

  test("middle click closes a tab", async () => {
    const closed = [];
    render(TabBar, { props: props({ onClose: (i) => closed.push(i) }) });

    await fireEvent(
      screen.getAllByRole("tab")[2].closest(".tabs__item"),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );

    expect(closed).toEqual([2]);
  });

  // Reordering is pointer-based (no native drag), so jsdom has no layout to
  // offer — each tab is given a fake 100px-wide rect side by side, and the
  // pointer is moved to the slot to land in.
  const layOut = (els) =>
    [...els].forEach((el, i) => {
      el.getBoundingClientRect = () => ({
        left: i * 100,
        right: i * 100 + 100,
        width: 100,
        top: 0,
        bottom: 28,
        height: 28,
        x: i * 100,
        y: 0,
        toJSON() {},
      });
    });

  test("dragging a tab onto another reports the move", async () => {
    const moves = [];
    const { container } = render(TabBar, {
      props: props({ onMove: (from, to) => moves.push([from, to]) }),
    });

    const els = container.querySelectorAll(".tabs__item");
    layOut(els);
    // Grab the first tab and carry it past the third's midpoint.
    await fireEvent.pointerDown(els[0], { button: 0, pointerId: 1, clientX: 10 });
    await fireEvent.pointerMove(els[0], { pointerId: 1, clientX: 260 });
    await fireEvent.pointerUp(els[0], { pointerId: 1, clientX: 260 });

    expect(moves).toEqual([[0, 2]]);
  });

  test("a tab released on itself moves nothing", async () => {
    const moves = [];
    const { container } = render(TabBar, {
      props: props({ onMove: (from, to) => moves.push([from, to]) }),
    });

    const els = container.querySelectorAll(".tabs__item");
    layOut(els);
    // Past the 5px threshold, but still over its own slot.
    await fireEvent.pointerDown(els[1], { button: 0, pointerId: 1, clientX: 110 });
    await fireEvent.pointerMove(els[1], { pointerId: 1, clientX: 130 });
    await fireEvent.pointerUp(els[1], { pointerId: 1, clientX: 130 });

    expect(moves).toEqual([]);
  });
});
