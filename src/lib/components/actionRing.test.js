// The column as it is DRAWN. Where it goes is `services/ring.test.js`; what
// is tested here is the other half — that the window's one column answers the
// service (the gesture's only way in), and that one opened by a CLICK stays up
// and can be pressed, because there no finger is holding it.
import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { tick } from "svelte";
import ActionRing from "./ActionRing.svelte";
import { closeRing, hoverRing, openRing, popRing } from "../services/actionRing.js";
import { ringBox, ringQuadrant } from "../services/ring.js";

const slices = (ids) => ids.map((id) => ({ id, icon: "dots-three", label: id, run: vi.fn() }));

const gesture = (actions, at = { x: 100, y: 100 }) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const quadrant = ringQuadrant(at, viewport);
  return {
    actions,
    at,
    count: actions.length,
    quadrant,
    box: ringBox(at, viewport, actions.length, quadrant),
  };
};

describe("the action ring", () => {
  beforeEach(() => {
    window.innerWidth = 800;
    window.innerHeight = 600;
  });
  afterEach(cleanup);

  test("it is nothing at all until the gesture opens it", async () => {
    render(ActionRing);
    expect(document.querySelector(".action-ring")).toBeNull();

    openRing(gesture(slices(["complete", "day", "more"])));
    await tick();
    expect(document.querySelectorAll(".action-ring__pill")).toHaveLength(3);
    closeRing();
    await tick();
    expect(document.querySelector(".action-ring")).toBeNull();
  });

  test("the square under the finger is the one that reads its name", async () => {
    render(ActionRing);
    openRing(gesture(slices(["complete", "day", "more"])));
    await tick();
    expect(screen.queryByText("day")).toBeNull();

    hoverRing(1);
    await tick();
    expect(await screen.findByText("day")).toBeTruthy();
    expect(document.querySelectorAll(".action-ring__pill--on")).toHaveLength(1);

    // Off the squares again: the column stays open, nothing is chosen.
    hoverRing(null);
    await tick();
    expect(screen.queryByText("day")).toBeNull();
    expect(document.querySelectorAll(".action-ring__pill")).toHaveLength(3);
    closeRing();
    await tick();
  });

  test("opened by a CLICK the squares are pressed, and pressing one closes it", async () => {
    render(ActionRing);
    const actions = slices(["pin", "edit", "more"]);
    popRing({ actions, at: { x: 120, y: 90 } });
    await tick();

    const pills = document.querySelectorAll(".action-ring--sticky .action-ring__pill");
    expect(pills).toHaveLength(3);
    await userEvent.click(screen.getByLabelText("edit"));

    expect(actions[1].run).toHaveBeenCalled();
    expect(document.querySelector(".action-ring")).toBeNull();
  });

  test("a click column closes on the wash, and on Escape, choosing nothing", async () => {
    render(ActionRing);
    const actions = slices(["pin", "edit"]);
    popRing({ actions, at: { x: 120, y: 90 } });
    await tick();
    await userEvent.click(document.querySelector(".action-ring__wash"));
    expect(document.querySelector(".action-ring")).toBeNull();
    expect(actions.every((a) => !a.run.mock.calls.length)).toBe(true);

    popRing({ actions, at: { x: 120, y: 90 } });
    await tick();
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector(".action-ring")).toBeNull();
    expect(actions.every((a) => !a.run.mock.calls.length)).toBe(true);
  });

  // 2026-09-15: a slice whose panel threw on the way up left the column
  // standing over every screen (docs/historico.md) — closing and the panel
  // were one redraw, so the panel took the closing down with it.
  test("the column is already gone by the time a slice runs", async () => {
    render(ActionRing);
    let standing = "not run";
    const actions = [
      {
        id: "edit",
        icon: "pencil",
        label: "edit",
        // Whatever it does — open a panel, throw on the way up — the column
        // is not on the screen any more to be left behind.
        run: () => (standing = !!document.querySelector(".action-ring")),
      },
    ];
    popRing({ actions, at: { x: 120, y: 90 } });
    await tick();
    await userEvent.click(screen.getByLabelText("edit"));
    await tick();

    expect(standing).toBe(false);
    expect(document.querySelector(".action-ring")).toBeNull();
  });

  test("more than five never reach the column", async () => {
    render(ActionRing);
    popRing({ actions: slices(["a", "b", "c", "d", "e", "f"]), at: { x: 40, y: 40 } });
    await tick();
    expect(document.querySelectorAll(".action-ring__pill")).toHaveLength(5);
    closeRing();
    await tick();
  });

  test("the column near the far corner opens back into the screen", async () => {
    render(ActionRing);
    const at = { x: 780, y: 580 };
    popRing({ actions: slices(["a", "b", "c"]), at });
    await tick();
    const column = document.querySelector(".action-ring__column");
    // From the bottom right corner it grows up and to the LEFT
    // (services/ring.js), so the names are written to the left of it.
    expect(Number(column.style.left.replace("px", ""))).toBeLessThan(at.x);
    expect(Number(column.style.top.replace("px", ""))).toBeLessThan(at.y);
    hoverRing(0);
    await tick();
    expect(document.querySelector(".action-ring__label--before")).toBeTruthy();
    closeRing();
    await tick();
  });
});
