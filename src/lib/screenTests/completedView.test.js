// The Completed screen.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { back } from "../services/back.js";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens, task } from "../test/screens.js";
import CompletedView from "../screens/CompletedView.svelte";

beforeEach(resetScreens);

describe("CompletedView", () => {
  test("unchecking sends the task back through uncomplete_task on its own list", async () => {
    bridge({
      completed_tasks: [
        {
          path: "Space 1/Tasks 1/Completed.md",
          task: task("a1", "Pagar internet", { done: true, origin: "Compras" }),
        },
      ],
      uncomplete_task: {},
    });

    render(CompletedView, {
      props: { readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    expect(await screen.findByText(/back to Compras/)).toBeTruthy();
    await userEvent.click(screen.getByLabelText("uncheck"));

    // The address is the item's own Completed list — there is one per widget,
    // and unchecking through the wrong one was exactly the aggregation bug.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("uncomplete_task", {
        list: "Space 1/Tasks 1/Completed.md",
        id: "a1",
      }),
    );
  });

  test("a task with no id cannot be unchecked", async () => {
    // Hand-written in another editor and not yet adopted: acting on it would
    // have nothing to address.
    bridge({
      completed_tasks: [
        { path: "jott.tasks/completed.md", task: task(null, "Escrita à mão", { done: true }) },
      ],
    });

    render(CompletedView, {
      props: { readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    await screen.findByText("Escrita à mão");
    expect(screen.getByLabelText("uncheck").disabled).toBe(true);
  });

  test("aggregates the Completed of every widget, fixed and user-made", async () => {
    // The screen used to read a single hardcoded list, so anything completed
    // inside a user space never showed up here.
    bridge({
      completed_tasks: [
        { path: "jott.tasks/completed.md", task: task("a1", "Da Inbox", { done: true }) },
        { path: "Space 1/Tasks 1/Completed.md", task: task("b2", "Do space", { done: true }) },
      ],
    });

    render(CompletedView, {
      props: { readOnly: false, onChanged: noop, onError: noop, reloadKey: 0 },
    });

    expect(await screen.findByText("Da Inbox")).toBeTruthy();
    expect(screen.getByText("Do space")).toBeTruthy();
    expect(screen.getByText(/Space 1\/Tasks 1/)).toBeTruthy();
  });
});
