// The New task popup, from wherever it is opened.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens } from "../test/screens.js";
import TasksSpace from "../spaces/TasksSpace.svelte";
import NewTaskDialog from "../components/NewTaskDialog.svelte";

beforeEach(resetScreens);

describe("the New task popup", () => {
  // The blue button opens a centred dialog over a dimmed page (wireframe
  // "New task popup.pdf"). It only COMPOSES — the caller writes, which is why
  // the same dialog can pull into the day from a day's screen and not from a
  // space widget.
  //
  // It is driven by a STORE (services/dialog.js), so the dialog and the screen
  // that opens it are mounted side by side here rather than through App. Home
  // no longer opens it at all: its blue button became the capture box
  // (2026-08-13), and what that button used to guarantee is now asserted in
  // the HomeView block above.
  const props = {
    // The day's screen (2026-09-04): the tasks source over today.
    source: { kind: "tasks", folder: null, name: "Today tasks" },
    day: null,
    today: "2026-07-21",
    lists: [
      { path: "jott.tasks/task-list.md", name: "Inbox" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
    defaultList: "jott.tasks/task-list.md",
    readOnly: false,
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
  };

  const openOn = (extra = {}) => {
    bridge({ day_tasks: [], day_sort: null, ...extra });
    render(NewTaskDialog);
    // `compose="button"` is the widget's default everywhere except the Tasks
    // screen, which pins a bar instead.
    render(TasksSpace, { props: { ...props, compose: "button" } });
  };

  test("the blue button composes a task and pulls it into the day", async () => {
    openOn({ create_task: 0, ensure_task_id: "novo", pull_into_day: true });

    await userEvent.click(await screen.findByText("New task"));

    // A real dialog, not a prompt: it has the composing row inside it.
    const composer = await screen.findByPlaceholderText("Create a task…");
    await userEvent.type(composer, "Comprar cimento{Enter}");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_task", {
        list: "jott.tasks/task-list.md",
        text: "Comprar cimento",
      }),
    );
    // Created from the day's block, so it joins the day — otherwise it would
    // not appear where the button was clicked.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_day", {
        day: null,
        list: "jott.tasks/task-list.md",
        id: "novo",
      }),
    );
    // And it closes itself once it has an answer.
    await waitFor(() => expect(screen.queryByPlaceholderText("Create a task…")).toBeNull());
  });

  test("closing it writes nothing", async () => {
    openOn({ create_task: 0 });

    await userEvent.click(await screen.findByText("New task"));
    await screen.findByPlaceholderText("Create a task…");
    await userEvent.click(screen.getByLabelText("Cancel"));

    await waitFor(() => expect(screen.queryByPlaceholderText("Create a task…")).toBeNull());
    expect(invoke.mock.calls.some(([cmd]) => cmd === "create_task")).toBe(false);
  });

  test("Escape closes it, and nothing behind it hears the key", async () => {
    // The three dialogs share one frame (components/Modal.svelte), and the
    // rule that frame exists to keep is this one: Escape is SWALLOWED. Without
    // it the shell's own Escape closes the task inspector at the same time —
    // one key, two things dismissed.
    openOn({ create_task: 0 });
    const heard = [];
    window.addEventListener("keydown", (e) => heard.push(e.key));

    await userEvent.click(await screen.findByText("New task"));
    const composer = await screen.findByPlaceholderText("Create a task…");
    await fireEvent.keyDown(composer, { key: "Escape", bubbles: true });

    await waitFor(() => expect(screen.queryByPlaceholderText("Create a task…")).toBeNull());
    expect(heard).not.toContain("Escape");
  });
});
