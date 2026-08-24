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

/// An engine that reports one `task-row-finish` playing on the card, and lets
/// the test decide when it finishes.
function playing(card, name = "task-row-finish") {
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
