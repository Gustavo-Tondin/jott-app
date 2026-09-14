// The ring as it is DRAWN. The angles are `services/ring.test.js`; what is
// tested here is the other half — that the window's one ring answers the
// service (the gesture's only way in), and that a ring opened by a CLICK stays
// up and can be pressed, because there no finger is holding it.
import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { tick } from "svelte";
import ActionRing from "./ActionRing.svelte";
import { closeRing, hoverRing, openRing, popRing } from "../services/actionRing.js";

const slices = (ids) => ids.map((id) => ({ id, icon: "dots-three", label: id, run: vi.fn() }));

const gesture = (actions, at = { x: 100, y: 100 }) => ({
  actions,
  at,
  count: actions.length,
  quadrant: { x: 1, y: 1 },
});

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

  test("the slice under the finger is the one that reads its name", async () => {
    render(ActionRing);
    openRing(gesture(slices(["complete", "day", "more"])));
    await tick();
    expect(screen.queryByText("day")).toBeNull();

    hoverRing(1);
    await tick();
    expect(await screen.findByText("day")).toBeTruthy();
    expect(document.querySelectorAll(".action-ring__slice--on")).toHaveLength(1);

    // Off the pills again: the ring stays open, nothing is chosen.
    hoverRing(null);
    await tick();
    expect(screen.queryByText("day")).toBeNull();
    expect(document.querySelectorAll(".action-ring__pill")).toHaveLength(3);
    closeRing();
    await tick();
  });

  test("opened by a CLICK the pills are pressed, and pressing one closes it", async () => {
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

  test("a click ring closes on the wash, and on Escape, choosing nothing", async () => {
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

  test("more than five never reach the pills", async () => {
    render(ActionRing);
    popRing({ actions: slices(["a", "b", "c", "d", "e", "f"]), at: { x: 40, y: 40 } });
    await tick();
    expect(document.querySelectorAll(".action-ring__pill")).toHaveLength(5);
    closeRing();
    await tick();
  });

  test("the ring near the far corner opens back into the screen", async () => {
    render(ActionRing);
    popRing({ actions: slices(["a", "b", "c"]), at: { x: 780, y: 580 } });
    await tick();
    const pill = document.querySelector(".action-ring__slice");
    // The first pill sits on the horizontal axis, and from the bottom right
    // that axis points LEFT: a negative offset (services/ring.js).
    expect(pill.getAttribute("style")).toMatch(/--ring-x: -\d/);
    closeRing();
    await tick();
  });
});
