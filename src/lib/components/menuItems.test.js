// The rows every menu draws. The `checked` mark earned a test the day it was
// found spelled four ways — twice through `context`, which renders with a
// trailing slash, so the layout menu literally read "✓/Grid".

import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, test, expect } from "vitest";

import MenuItems from "./MenuItems.svelte";

describe("MenuItems", () => {
  test("the chosen row of a choice group carries the tick, its siblings the empty slot", () => {
    const { container } = render(MenuItems, {
      props: {
        items: [
          { label: "Grid", checked: true, run() {} },
          { label: "Tree", checked: false, run() {} },
        ],
      },
    });

    const [grid, tree] = [...container.querySelectorAll(".menu__link")];
    expect(grid.querySelector(".menu__check").textContent).toBe("✓");
    // The slot exists empty, so the labels of the group stay aligned.
    expect(tree.querySelector(".menu__check").textContent).toBe("");
  });

  test("the middle button runs the row with the new-tab gesture", async () => {
    // A row that opens a screen reads it; any other row is free to ignore it.
    const runs = [];
    const { container } = render(MenuItems, {
      props: {
        items: [{ label: "Trash", run() {} }],
        onChoose: (item, gesture) => runs.push([item.label, gesture]),
      },
    });
    const row = container.querySelector(".menu__link");
    await fireEvent(row, new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
    await fireEvent.click(row);
    expect(runs).toEqual([
      ["Trash", { newTab: true }],
      ["Trash", {}],
    ]);
  });

  test("a row outside a choice group gets no slot at all", () => {
    const { container } = render(MenuItems, {
      props: { items: [{ label: "Rename", run() {} }] },
    });
    expect(container.querySelector(".menu__check")).toBeNull();
  });

  test("context stays a place qualifier, never the mark", () => {
    // `Design/` before `Tasks` — the documented job. A tick passed through
    // here is the bug this component's `checked` field exists to end.
    render(MenuItems, {
      props: { items: [{ label: "Tasks", context: "Design", run() {} }] },
    });
    expect(screen.getByText("Design/")).toBeTruthy();
  });

  test("a submenu row can carry the tick too", async () => {
    const { container } = render(MenuItems, {
      props: {
        items: [
          {
            label: "Sort",
            items: [
              { label: "File order", checked: false, run() {} },
              { label: "By name", checked: true, run() {} },
            ],
          },
        ],
      },
    });

    await fireEvent.click(container.querySelector(".menu__link--sub"));
    // The sub panel is portalled to <body> by keepOnScreen — look there.
    const marks = [...document.querySelectorAll(".menu__sub .menu__check")];
    expect(marks.map((m) => m.textContent)).toEqual(["", "✓"]);
  });
});
