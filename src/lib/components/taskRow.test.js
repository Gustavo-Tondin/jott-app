// The send-off a task gets when it is ticked (TaskRow.svelte): the write waits
// for the animation, and only for an animation that is really playing.
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vitest";
import TaskRow from "./TaskRow.svelte";

const row = (extra = {}) => {
  const done = [];
  const result = render(TaskRow, {
    props: {
      list: "jott.tasks/task-list.md",
      task: { id: "a1", text: "Fix website", done: false, tags: [], subtasks: [] },
      onComplete: (list, task) => done.push(task.id),
      ...extra,
    },
  });
  const box = result.container.querySelector(".task-row__check");
  const card = result.container.querySelector(".task-row");
  return { ...result, box, card, done };
};

/// An engine that reports one `task-row-hold` playing on the card — the
/// animation the row waits on — and lets the test decide when it finishes.
function playing(card, name = "task-row-hold") {
  let end;
  const finished = new Promise((r) => (end = r));
  card.getAnimations = () => [{ animationName: name, finished }];
  return end;
}

afterEach(() => vi.useRealTimers());

describe("TaskRow — completing", () => {
  test("writes at once where nothing plays (jsdom, reduced motion)", async () => {
    const { box, done, card } = row();
    await fireEvent.click(box);
    await waitFor(() => expect(done).toEqual(["a1"]));
    expect(card.classList.contains("task-row--finishing")).toBe(false);
  });

  test("marks the card and waits for the send-off to finish", async () => {
    const { box, done, card } = row();
    const end = playing(card);
    await fireEvent.click(box);
    await waitFor(() => expect(card.classList.contains("task-row--finishing")).toBe(true));
    expect(done).toEqual([]);
    end();
    await waitFor(() => expect(done).toEqual(["a1"]));
    expect(card.classList.contains("task-row--finishing")).toBe(false);
  });

  test("ticking again while it plays is the undo: nothing is written", async () => {
    const { box, done, card } = row();
    const end = playing(card);
    await fireEvent.click(box);
    await waitFor(() => expect(card.classList.contains("task-row--finishing")).toBe(true));
    await fireEvent.click(box);
    expect(card.classList.contains("task-row--finishing")).toBe(false);
    end();
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toEqual([]);
  });

  test("an animation that never reports back does not hold the task hostage", async () => {
    vi.useFakeTimers();
    const { box, done, card } = row();
    playing(card);
    await fireEvent.click(box);
    await vi.advanceTimersByTimeAsync(1600);
    expect(done).toEqual(["a1"]);
  });

  test("unticking a done task plays its own send-off, and waits for it", async () => {
    const { box, done, card } = row({
      task: { id: "a1", text: "Fix website", done: true, tags: [], subtasks: [] },
    });
    const end = playing(card, "task-row-restore");
    await fireEvent.click(box);
    await waitFor(() => expect(card.classList.contains("task-row--restoring")).toBe(true));
    expect(card.classList.contains("task-row--finishing")).toBe(false);
    expect(done).toEqual([]);
    end();
    await waitFor(() => expect(done).toEqual(["a1"]));
  });
});

// The time axis on a card (spec 3.6, M7/M8): the number comes stamped from
// the core, and what is tested here is only that the card draws it, that the
// switch takes it away, and that "forgotten" is the one band with a colour.
describe("TaskRow — the age stamp", () => {
  const stamped = (age, extra = {}) =>
    row({
      task: {
        id: "a1",
        text: "Fix website",
        done: false,
        tags: [],
        subtasks: [],
        created: "2026-08-16",
        age,
      },
      ...extra,
    });

  test("draws the number of days beside the other fields", () => {
    const { container } = stamped({ days: 12, band: "stale" });
    const stamp = container.querySelector(".task-row__field--age");
    expect(stamp.textContent.trim()).toBe("12d");
    expect(stamp.classList.contains("task-row__field--forgotten")).toBe(false);
    expect(stamp.getAttribute("title")).toBe("Created 08/16/2026");
  });

  test("a forgotten task takes the warning ink", () => {
    const { container } = stamped({ days: 45, band: "forgotten" });
    expect(
      container
        .querySelector(".task-row__field--age")
        .classList.contains("task-row__field--forgotten"),
    ).toBe(true);
  });

  test("with the time axis switched off there is no stamp at all", () => {
    const { container } = stamped({ days: 12, band: "stale" }, { f: (key) => key !== "time" });
    expect(container.querySelector(".task-row__field--age")).toBe(null);
    // And nothing else was drawn in its place: a card with no other field
    // keeps no empty meta row.
    expect(container.querySelector(".task-row__meta")).toBe(null);
  });

  test("a task the core could not date says nothing", () => {
    const { container } = row();
    expect(container.querySelector(".task-row__field--age")).toBe(null);
  });
});

// Joining a day is answered on the card itself: the sun pops in the accent
// and settles (task-row.css). What is tested here is WHEN the pop is asked
// for — the animation itself is the stylesheet's.
describe("TaskRow — the sun lighting up", () => {
  const sunOf = (container) => container.querySelector(".task-row__sun");

  test("pops when the task joins the day, under the eye of whoever asked", async () => {
    const { container, rerender } = row({ inDay: false });
    expect(sunOf(container)).toBe(null);

    await rerender({
      list: "jott.tasks/task-list.md",
      task: { id: "a1", text: "Fix website", done: false, tags: [], subtasks: [] },
      inDay: true,
    });

    expect(sunOf(container).classList.contains("task-row__sun--lit")).toBe(true);
  });

  test("a card drawn already in the day is simply in it — no pop", () => {
    const { container } = row({ inDay: true });
    expect(sunOf(container)).toBeTruthy();
    expect(sunOf(container).classList.contains("task-row__sun--lit")).toBe(false);
  });

  test("the pop is over when the animation ends, so it never plays twice", async () => {
    const { container, rerender } = row({ inDay: false });
    await rerender({
      list: "jott.tasks/task-list.md",
      task: { id: "a1", text: "Fix website", done: false, tags: [], subtasks: [] },
      inDay: true,
    });
    await fireEvent.animationEnd(sunOf(container));
    expect(sunOf(container).classList.contains("task-row__sun--lit")).toBe(false);
  });
});

// A card that was not in the list at the last read rises into place. The row
// only wears what the list decides (spaces/TasksSpace.svelte).
describe("TaskRow — arriving", () => {
  test("wears the arrival only when the list says it has just arrived", () => {
    expect(row().card.classList.contains("task-row--arriving")).toBe(false);
    expect(row({ arriving: true }).card.classList.contains("task-row--arriving")).toBe(true);
  });
});
