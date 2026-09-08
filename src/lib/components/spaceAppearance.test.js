// The colour + icon popup with the whole Phosphor set behind a search field
// (2026-09-07). What it checks: the popup opens with the ten familiar icons
// before the library lands and the whole set after; typing narrows the grid
// and the status line says how many; a tile calls onIcon with the name, the
// empty slot calls it with "" (which is how the core clears the marker).

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, test, vi } from "vitest";

import SpaceAppearance from "./SpaceAppearance.svelte";

// `keepOnScreen` portals the panel to <body>, so the render's container
// holds only the anchor; the panel is asked of the document.
const panel = () => document.body.querySelector(".palette__panel");
// The library is 1512 files transformed on first read; under the full
// suite's parallel workers that can pass testing-library's one second.
const LIBRARY_WAIT = { timeout: 20_000 };
const tiles = () => [...document.body.querySelectorAll(".palette__grid .palette__icon")];

describe("SpaceAppearance", () => {
  afterEach(cleanup);

  test("opens with the familiar ten, then the whole set once the library is read", async () => {
    render(SpaceAppearance, { props: { open: true, icon: null } });
    // The clear slot plus the ten bundled ones, synchronously.
    expect(tiles().length).toBe(11);
    expect(tiles()[1].getAttribute("aria-label")).toBe("list-checks");
    await waitFor(() => expect(screen.getByText(/1512 icons/)).toBeTruthy(), LIBRARY_WAIT);
    // A page at a time: the first 96, still led by the ten.
    expect(tiles().length).toBe(1 + 96);
    expect(tiles()[1].getAttribute("aria-label")).toBe("list-checks");
    expect(tiles()[11].getAttribute("aria-label")).toBe("acorn");
  }, 30_000);

  test("typing narrows the grid by name and by tag, and the line counts", async () => {
    render(SpaceAppearance, { props: { open: true } });
    await waitFor(() => expect(screen.getByText(/1512 icons/)).toBeTruthy(), LIBRARY_WAIT);
    const field = screen.getByLabelText("Search icons");
    await fireEvent.input(field, { target: { value: "money" } });
    await tick();
    const names = tiles().map((t) => t.getAttribute("aria-label"));
    expect(names[0]).toBe("money");
    expect(names).toContain("money-wavy");
    // By tag alone: `bank` has no "money" in its name.
    expect(names).toContain("bank");
    // The clear slot is not a match for a query.
    expect(names).not.toContain("default");
    expect(screen.getByText(`${names.length} icons`)).toBeTruthy();

    await fireEvent.input(field, { target: { value: "zzzz" } });
    await tick();
    expect(tiles()).toEqual([]);
    expect(screen.getByText("No icon matches that.")).toBeTruthy();
  }, 30_000);

  test("a tile picks its name; the empty slot picks the default; the worn one is pressed", async () => {
    const onIcon = vi.fn();
    render(SpaceAppearance, { props: { open: true, icon: "flag", onIcon } });
    const flag = tiles().find((t) => t.getAttribute("aria-label") === "flag");
    expect(flag.getAttribute("aria-pressed")).toBe("true");
    expect(tiles()[0].getAttribute("aria-pressed")).toBe("false");

    await fireEvent.click(tiles().find((t) => t.getAttribute("aria-label") === "sun"));
    expect(onIcon).toHaveBeenLastCalledWith("sun");
    await fireEvent.click(tiles()[0]);
    expect(onIcon).toHaveBeenLastCalledWith("");
  });

  test("picking never re-orders the grid under the pointer", async () => {
    // The head of the grid is the icon the space wore WHEN THE POPUP OPENED.
    // Were it the live one, every pick would move the glyphs about.
    const { rerender } = render(SpaceAppearance, { props: { open: true, icon: "lightbulb" } });
    await waitFor(() => expect(screen.getByText(/1512 icons/)).toBeTruthy(), LIBRARY_WAIT);
    const before = tiles().map((t) => t.getAttribute("aria-label"));
    expect(before[11]).toBe("lightbulb");

    await rerender({ open: true, icon: "acorn" });
    await tick();
    expect(tiles().map((t) => t.getAttribute("aria-label"))).toEqual(before);
  }, 30_000);

  test("a space inside a group gets the icons but not the colours", () => {
    render(SpaceAppearance, { props: { open: true, colors: false } });
    expect(panel().querySelector(".accent-picker")).toBeNull();
    expect(panel().querySelector(".palette__grid")).toBeTruthy();
  });

  test("closed, nothing is drawn and nothing is read", () => {
    render(SpaceAppearance, { props: { open: false } });
    expect(panel()).toBeNull();
  });
});
