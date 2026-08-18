// Recording a chord.
//
// The rules worth guarding are the ones that make a bad binding impossible
// rather than merely discouraged: a chord that would swallow typing is
// refused, a chord another command already answers is refused, and Escape
// leaves everything as it was.

import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import ShortcutRow from "./ShortcutRow.svelte";
import { bindings, commandById } from "../services/commands.js";

const bound = bindings();

function row(id = "task.new", onBind = () => {}) {
  const command = commandById(id);
  return render(ShortcutRow, {
    props: { command, chord: bound.get(id) ?? null, bound, onBind },
  });
}

const record = async () => {
  await userEvent.click(screen.getByTitle("Record a new key"));
  return screen.getByText("Press a key…");
};

describe("ShortcutRow", () => {
  it("shows the command and the chord it answers to", () => {
    row();
    expect(screen.getByText("New task")).toBeTruthy();
    expect(screen.getByText("Ctrl+T")).toBeTruthy();
  });

  it("records the chord that was pressed", async () => {
    const got = [];
    row("task.new", (chord) => got.push(chord));
    const box = await record();
    await fireEvent.keyDown(box, { key: "j", ctrlKey: true, shiftKey: true });
    expect(got).toEqual(["Mod+Shift+J"]);
  });

  it("refuses a chord that would swallow typing", async () => {
    const got = [];
    row("task.new", (chord) => got.push(chord));
    const box = await record();
    await fireEvent.keyDown(box, { key: "j" });
    expect(screen.getByText("That would swallow typing")).toBeTruthy();
    expect(got).toEqual([]);
  });

  it("refuses a chord another command already answers, and names it", async () => {
    const got = [];
    row("task.new", (chord) => got.push(chord));
    const box = await record();
    // Ctrl+N is New note.
    await fireEvent.keyDown(box, { key: "n", ctrlKey: true });
    expect(screen.getByText("Already: New note")).toBeTruthy();
    expect(got).toEqual([]);
  });

  it("ignores a modifier held on the way to a chord", async () => {
    const got = [];
    row("task.new", (chord) => got.push(chord));
    const box = await record();
    await fireEvent.keyDown(box, { key: "Control", ctrlKey: true });
    expect(got).toEqual([]);
    // Still listening — it did not take the modifier for an answer.
    expect(screen.getByText("Press a key…")).toBeTruthy();
  });

  it("leaves everything as it was on Escape", async () => {
    const got = [];
    row("task.new", (chord) => got.push(chord));
    const box = await record();
    await fireEvent.keyDown(box, { key: "Escape" });
    expect(got).toEqual([]);
    expect(screen.getByText("Ctrl+T")).toBeTruthy();
  });

  it("clears a binding with the ×", async () => {
    const got = [];
    row("task.new", (chord) => got.push(chord));
    await userEvent.click(screen.getByTitle("Remove this key"));
    expect(got).toEqual([null]);
  });

  it("says so when a command has no key, and offers to give it one", () => {
    // `md.rule` ships unbound on purpose.
    const command = commandById("md.rule");
    render(ShortcutRow, { props: { command, chord: null, bound, onBind: () => {} } });
    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.queryByTitle("Remove this key")).toBeNull();
  });
});
