// What a screen reader hears when a task moves (TaskCards.svelte): the list
// redraws in silence otherwise, and the card is simply somewhere else.
import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, test } from "vitest";
import TaskCards from "./TaskCards.svelte";
import { setLiveRegion } from "../services/announce.js";

const entry = (id, text) => ({
  list: "jott.tasks/task-list.md",
  task: { id, text, done: false, tags: [], subtasks: [] },
});

describe("TaskCards — moving by the keyboard", () => {
  let region;

  beforeEach(() => {
    document.body.innerHTML = "";
    region = document.createElement("div");
    document.body.append(region);
    setLiveRegion(region);
  });

  const cards = (extra = {}) => {
    const moves = [];
    const result = render(TaskCards, {
      props: {
        items: [entry("a1", "Milk"), entry("b2", "Bread"), entry("c3", "Coffee")],
        onReorder: (from, to) => moves.push([from, to]),
        ...extra,
      },
    });
    return { ...result, moves, list: result.container.querySelector('[role="grid"]') };
  };

  test("Alt+ArrowDown moves the focused task, and says where it landed", async () => {
    const { list, moves } = cards();
    await fireEvent.keyDown(list, { key: "ArrowDown", altKey: true });

    expect(moves).toEqual([[0, 1]]);
    expect(region.textContent).toBe("Milk moved to position 2 of 3");
  });

  test("Alt+ArrowUp on the first task does nothing, and says nothing", async () => {
    const { list, moves } = cards();
    await fireEvent.keyDown(list, { key: "ArrowUp", altKey: true });

    expect(moves).toEqual([]);
    expect(region.textContent).toBe("");
  });

  test("the focus follows the task that moved, once the list comes back", async () => {
    // The move is written to disk and the list is redrawn from the notebook —
    // the row is a new element by then. Focusing the old one left the next key
    // press with nowhere to go (measured in the app, 2026-09-14).
    const { list, rerender } = cards();
    await fireEvent.keyDown(list, { key: "ArrowDown", altKey: true });

    await rerender({
      items: [entry("b2", "Bread"), entry("a1", "Milk"), entry("c3", "Coffee")],
      onReorder: () => {},
    });
    await new Promise((resolve) => queueMicrotask(resolve));

    expect(document.activeElement?.dataset?.card).toBe("1");
  });

  test("a list that cannot be reordered stays quiet", async () => {
    const { list } = cards({ onReorder: null });
    await fireEvent.keyDown(list, { key: "ArrowDown", altKey: true });

    expect(region.textContent).toBe("");
  });
});
