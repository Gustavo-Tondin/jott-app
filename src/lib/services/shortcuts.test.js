import { describe, it, expect } from "vitest";
import { keyboard, typing } from "./shortcuts.js";
import { bindings } from "./commands.js";

const ask = keyboard(bindings());

const press = (key, mods = {}) => ({
  key,
  code: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
  ...mods,
});

describe("keyboard shortcuts", () => {
  it("captures a task and a note from anywhere", () => {
    expect(ask(press("t", { ctrlKey: true }))).toBe("task.new");
    expect(ask(press("n", { ctrlKey: true }))).toBe("note.new");
  });

  it("takes the platform modifier, upper or lower case", () => {
    expect(ask(press("T", { metaKey: true }))).toBe("task.new");
    expect(ask(press("N", { ctrlKey: true }))).toBe("note.new");
  });

  it("keeps the bare keys it already answered", () => {
    expect(ask(press("F11"))).toBe("app.fullscreen");
    // Escape is the shell's own, and is not a command: dismissing is about
    // what is open, not about a binding a user could take away.
    expect(ask(press("Escape"))).toBe(null);
  });

  it("does not steal a plain letter — that is someone typing", () => {
    expect(ask(press("t"))).toBe(null);
    expect(ask(press("n"))).toBe(null);
  });

  it("stays out of combinations it does not own", () => {
    expect(ask(press("t", { ctrlKey: true, metaKey: true }))).toBe(null);
    expect(ask(press("j", { ctrlKey: true }))).toBe(null);
  });

  it("answers Shift and Alt now that commands ask for them", () => {
    // The old table refused both outright. It could, with six shortcuts; the
    // tab and history commands need them.
    expect(ask(press("F", { ctrlKey: true, shiftKey: true }))).toBe(
      "search.notebook.global",
    );
    expect(ask(press("ArrowLeft", { ctrlKey: true, altKey: true }))).toBe("nav.back");
    expect(ask(press("Tab", { ctrlKey: true, shiftKey: true }))).toBe("tab.previous");
  });

  it("yields to whoever answered closer to the keyboard", () => {
    expect(ask(press("f", { ctrlKey: true, defaultPrevented: true }))).toBe(null);
  });

  it("gives a focused task list the bare keys, and never inside a field", () => {
    const list = { closest: () => null };
    expect(ask(press("ArrowDown", { target: list }), "tasks")).toBe("task.down");
    expect(ask(press(" ", { target: list }), "tasks")).toBe("task.complete");

    const field = { closest: (sel) => (sel.includes("input") ? {} : null) };
    expect(ask(press(" ", { target: field }), "tasks")).toBe(null);
    expect(ask(press("ArrowDown", { target: field }), "tasks")).toBe(null);
  });

  it("does not hand a task list key to the shell at large", () => {
    const list = { closest: () => null };
    expect(ask(press("ArrowDown", { target: list }), "global")).toBe(null);
  });

  it("knows a text field when it sees one", () => {
    expect(typing({ target: { closest: () => ({}) } })).toBe(true);
    expect(typing({ target: { closest: () => null } })).toBe(false);
    expect(typing({ target: null })).toBe(false);
  });
});
