// The trash — restore, delete for good, empty it.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { answerConfirm, noop, resetScreens } from "../test/screens.js";
import TrashView from "../screens/TrashView.svelte";

beforeEach(resetScreens);

describe("TrashView", () => {
  const entry = (id, label, extra = {}) => ({
    id,
    kind: "task",
    origin: "jott.tasks/task-list.md",
    label,
    deleted: "2026-08-01",
    daysLeft: 10,
    ...extra,
  });
  const props = (extra = {}) => ({ onChanged: noop, onError: noop, reloadKey: 0, ...extra });

  test("each row says how long it has left, or that it is kept", async () => {
    bridge({ trash_entries: [entry("a", "Comprar leite"), entry("b", "Pagar boleto", { daysLeft: null })] });
    render(TrashView, { props: props() });
    expect(await screen.findByText("10 days left")).toBeTruthy();
    expect(screen.getByText("kept until you restore it")).toBeTruthy();
  });

  test("the circular arrow restores without asking", async () => {
    bridge({ trash_entries: [entry("a", "Comprar leite")], restore_from_trash: null });
    render(TrashView, { props: props() });
    await userEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("restore_from_trash", { id: "a" }));
  });

  test("the bin deletes for good, but only after asking — every time", async () => {
    bridge({ trash_entries: [entry("a", "Comprar leite")], purge_from_trash: null });
    render(TrashView, { props: props() });
    await userEvent.click(await screen.findByRole("button", { name: "Delete forever" }));
    const asked = await answerConfirm(false);
    expect(asked.title).toContain("Comprar leite");
    // It must not lean on `confirmDeletes`: that switch is about a reversible trip.
    expect(asked.remember ?? "").toBe("");
    expect(invoke).not.toHaveBeenCalledWith("purge_from_trash", expect.anything());

    await userEvent.click(screen.getByRole("button", { name: "Delete forever" }));
    await answerConfirm(true);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("purge_from_trash", { id: "a" }));
  });

  test("Empty trash asks with the count and then empties", async () => {
    bridge({ trash_entries: [entry("a", "Um"), entry("b", "Dois")], empty_trash: 2 });
    render(TrashView, { props: props() });
    await userEvent.click(await screen.findByRole("button", { name: "Empty trash" }));
    const asked = await answerConfirm(true);
    expect(asked.title).toContain("2 items");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("empty_trash"));
  });

  test("a read-only notebook shows the list and none of the verbs", async () => {
    bridge({ trash_entries: [entry("a", "Um")] });
    render(TrashView, { props: props({ readOnly: true }) });
    expect(await screen.findByText("Um")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Empty trash" })).toBeNull();
  });

  test("it says when it is still reading, and when there is nothing to read", async () => {
    let answer;
    bridge({ trash_entries: () => new Promise((r) => (answer = r)) });
    render(TrashView, { props: props() });
    expect(await screen.findByRole("status")).toBeTruthy();
    answer([]);
    expect(await screen.findByText("The trash is empty.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Empty trash" })).toBeNull();
  });

  test("a task and a file are told apart, and the filter shows one kind at a time", async () => {
    bridge({
      trash_entries: [
        entry("a", "Comprar leite"),
        entry("b", "Receita.md", { kind: "file", origin: "jott.notes/Receita.md" }),
      ],
    });
    render(TrashView, { props: props() });
    expect(await screen.findByRole("img", { name: "task" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "file or folder" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /^Files/ }));
    await waitFor(() => expect(screen.queryByText("Comprar leite")).toBeNull());
    expect(screen.getByText("Receita.md")).toBeTruthy();
  });

  test("with one kind only there is nothing to filter, so no filter", async () => {
    bridge({ trash_entries: [entry("a", "Um"), entry("b", "Dois")] });
    render(TrashView, { props: props() });
    await screen.findByText("Um");
    expect(screen.queryByRole("button", { name: /^Files/ })).toBeNull();
  });
});
