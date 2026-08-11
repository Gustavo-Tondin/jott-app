// The tab model, tested as plain logic — no rendering involved.

import { describe, expect, test } from "vitest";
import {
  back,
  canGoBack,
  canGoForward,
  close,
  currentView,
  forward,
  move,
  navigate,
  open,
  replaceView,
  viewId,
} from "./tabs.js";

const list = (path) => ({ kind: "list", list: path });
const home = { kind: "home" };
const week = { kind: "period", period: "week" };

/// Opens a sequence of views from an empty bar.
function bar(...views) {
  return views.reduce(
    (state, view) => open(state.tabs, state.active, view),
    { tabs: [], active: 0 },
  );
}

describe("tabs", () => {
  test("opening a view that is already open focuses it instead of duplicating", () => {
    const first = bar(home, week);
    const again = open(first.tabs, first.active, home);

    expect(again.tabs.length).toBe(2);
    expect(again.active).toBe(0);
  });

  test("each tab carries its own history", () => {
    // Global history would make "back" jump between tabs, which is the
    // confusion tabs exist to avoid.
    let { tabs, active } = bar(home, week);
    ({ tabs, active } = navigate(tabs, active, list("Tasks/Inbox.md")));

    expect(viewId(currentView(tabs[active]))).toBe("list:Tasks/Inbox.md");
    expect(canGoBack(tabs[active])).toBe(true);
    // The other tab is untouched by the navigation.
    expect(canGoBack(tabs[0])).toBe(false);

    ({ tabs, active } = back(tabs, active));
    expect(viewId(currentView(tabs[active]))).toBe("week");
    expect(canGoForward(tabs[active])).toBe(true);

    ({ tabs, active } = forward(tabs, active));
    expect(viewId(currentView(tabs[active]))).toBe("list:Tasks/Inbox.md");
  });

  test("navigating after going back drops what was ahead", () => {
    let { tabs, active } = bar(home);
    ({ tabs, active } = navigate(tabs, active, week));
    ({ tabs, active } = back(tabs, active));
    ({ tabs, active } = navigate(tabs, active, list("Tasks/Inbox.md")));

    expect(canGoForward(tabs[active])).toBe(false);
    expect(tabs[active].views.length).toBe(2);
  });

  test("navigating to where you already are changes nothing", () => {
    const { tabs, active } = bar(home);
    const same = navigate(tabs, active, { kind: "home" });
    expect(same.tabs[0].views.length).toBe(1);
  });

  test("back and forward at the ends are no-ops, not errors", () => {
    const { tabs, active } = bar(home);
    expect(back(tabs, active).active).toBe(0);
    expect(forward(tabs, active).tabs[0].at).toBe(0);
  });

  test("closing the active tab lands on its neighbour", () => {
    const { tabs } = bar(home, week, list("Tasks/Inbox.md"));

    const closedMiddle = close(tabs, 1, 1);
    expect(closedMiddle.tabs.length).toBe(2);
    expect(viewId(currentView(closedMiddle.tabs[closedMiddle.active]))).toBe(
      "list:Tasks/Inbox.md",
    );

    // Closing to the left of the active one keeps you where you were.
    const closedLeft = close(tabs, 2, 0);
    expect(closedLeft.active).toBe(1);
    expect(viewId(currentView(closedLeft.tabs[closedLeft.active]))).toBe(
      "list:Tasks/Inbox.md",
    );
  });

  test("the last tab is never closed", () => {
    // An app with no tab open has nothing to show and no way back.
    const { tabs } = bar(home);
    expect(close(tabs, 0, 0).tabs.length).toBe(1);
  });

  test("a renamed document follows into the tab showing it", () => {
    const { tabs } = bar(home, list("Tasks/Compras.md"));
    const renamed = replaceView(tabs, "list:Tasks/Compras.md", list("Tasks/Mercado.md"));

    expect(viewId(currentView(renamed[1]))).toBe("list:Tasks/Mercado.md");
    expect(viewId(currentView(renamed[0]))).toBe("home");
  });

  test("moving a tab keeps the same one focused", () => {
    const { tabs } = bar(home, week, list("Tasks/Inbox.md"));

    // Dragging the tab you are on: focus follows it.
    const dragged = move(tabs, 0, 0, 2);
    expect(viewId(currentView(dragged.tabs[dragged.active]))).toBe("home");
    expect(dragged.tabs.map((t) => viewId(currentView(t)))).toEqual([
      "week",
      "list:Tasks/Inbox.md",
      "home",
    ]);

    // Dragging another tab past you: you stay on the same document.
    const other = move(tabs, 1, 0, 2);
    expect(viewId(currentView(other.tabs[other.active]))).toBe("week");
  });

  test("a move that goes nowhere changes nothing", () => {
    const { tabs } = bar(home, week);
    expect(move(tabs, 0, 1, 1).tabs).toBe(tabs);
    expect(move(tabs, 0, 0, 9).tabs).toBe(tabs);
    expect(move(tabs, 0, -1, 0).tabs).toBe(tabs);
  });

  test("view ids tell the documents apart", () => {
    expect(viewId(list("Tasks/Inbox.md"))).not.toBe(viewId(list("Notes/Inbox.md")));
    expect(viewId({ kind: "note", folder: "Notes", path: "a.md" })).toBe(
      "note:Notes/a.md",
    );
    expect(viewId(null)).toBe("");
  });
});
