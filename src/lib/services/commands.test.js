import { describe, it, expect } from "vitest";
import {
  COMMANDS,
  SCOPES,
  bindings,
  commandById,
  conflictOf,
  keymapFor,
} from "./commands.js";
import { isBindable, normalize } from "./keys.js";

describe("the command registry", () => {
  it("gives every command an id, a scope and a name", () => {
    for (const command of COMMANDS) {
      expect(command.id, JSON.stringify(command)).toBeTruthy();
      expect(SCOPES).toContain(command.scope);
      expect(typeof command.label()).toBe("string");
      expect(command.label().length).toBeGreaterThan(0);
    }
  });

  it("has no id twice — the map would silently lose one", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships no default chord that would swallow typing", () => {
    for (const command of COMMANDS) {
      if (!command.keys) continue;
      // The task scope answers only when nothing is being typed into, which
      // is what earns it the bare arrows, Enter and Space.
      if (command.scope === "tasks") continue;
      expect(isBindable(command.keys), `${command.id} → ${command.keys}`).toBe(true);
    }
  });

  it("ships no chord claimed by two commands that could both hear it", () => {
    const bound = bindings();
    for (const command of COMMANDS) {
      const chord = bound.get(command.id);
      if (!chord) continue;
      const clash = conflictOf(command.id, chord, bound);
      expect(clash?.id ?? null, `${command.id} vs ${clash?.id}`).toBe(null);
    }
  });

  it("lets the app's undo share the editor's chord, and only that pair", () => {
    // The clash is the design (2026-08-24): the editor claims Mod+Z first,
    // the shell hears the rest. A twin has to point back at a real command.
    const bound = bindings();
    for (const command of COMMANDS) {
      if (!command.twin) continue;
      expect(commandById(command.twin), `${command.id} → ${command.twin}`).not.toBeNull();
      expect(bound.get(command.id)).toBe(bound.get(command.twin));
      expect(conflictOf(command.id, command.keys, bound)).toBeNull();
    }
    expect(commandById("app.undo").twin).toBe("edit.undo");
    // A third command on that chord still clashes.
    expect(conflictOf("task.new", "Mod+Z", bound)?.id).toBeTruthy();
  });

  it("lets a user's binding win, and an unbind clear the key", () => {
    const bound = bindings({ "task.new": "Mod+Shift+Y", "note.new": null });
    expect(bound.get("task.new")).toBe("Mod+Shift+Y");
    expect(bound.has("note.new")).toBe(false);
  });

  it("ignores a binding it cannot honour instead of breaking on it", () => {
    // A command from a newer build, a chord that is plain typing, and junk.
    const bound = bindings({ "future.command": "Mod+Q", "task.new": "A", "note.new": 7 });
    expect(bound.has("future.command")).toBe(false);
    expect(bound.get("task.new")).toBe(normalize("Mod+T"));
    expect(bound.get("note.new")).toBe(normalize("Mod+N"));
  });

  it("reads back as chord → command, per scope", () => {
    const map = keymapFor("global", bindings());
    expect(map.get("Mod+T")).toBe("task.new");
    // A different scope's command is not in this map, even bound.
    expect(map.get("Mod+B")).toBeUndefined();
  });

  it("calls a clash between scopes that can both be heard, and only those", () => {
    const bound = bindings();
    // `global` is heard inside the editor too, so this is a real clash.
    expect(conflictOf("md.bold", "Mod+T", bound)?.id).toBe("task.new");
    // A task list and a text cursor are never focused at once.
    expect(conflictOf("md.bold", bound.get("task.complete"), bound)).toBe(null);
  });

  it("names an icon only for commands the formatting panel draws", () => {
    for (const command of COMMANDS) {
      if (!command.icon) continue;
      expect(command.scope, command.id).toBe("editor");
    }
    expect(commandById("md.bold").icon).toBe("bold");
  });
});
