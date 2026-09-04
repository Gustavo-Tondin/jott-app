// Where a quick note can land (user calls, 2026-08-24): the fixed Notes
// space's folders, the user's note spaces — and what happens to the choice
// when the fixed space is hidden.

import { describe, expect, test } from "vitest";
import { noteTargets, quickNoteTarget } from "./noteTargets.js";

const SETUP = {
  notesFolder: "jott.notes",
  notesInbox: "Inbox",
  folders: [
    { path: "Inbox", color: null, pinned: false },
    { path: "Ideas", color: "yellow", pinned: false },
  ],
  spaces: [
    // The fixed space itself rides in the snapshot's list — it must not
    // become a duplicate row.
    { path: "jott.notes", name: "Notes", kind: "notes", fixed: true },
    { path: "Design/Tasks", name: "Tarefas Design", kind: "tasks" },
    { path: "Design Notes", name: "Design Notes", kind: "notes" },
  ],
};

describe("noteTargets", () => {
  test("offers the fixed Inbox, its folders, then the user's note spaces", () => {
    // Folder ENTRIES, not names: the select drew `[object Object]` when the
    // 2026-08-19 shape change was missed (screenshot, 2026-08-24).
    const targets = noteTargets(SETUP);
    expect(targets.map((t) => t.label)).toEqual(["Inbox notes", "Ideas", "Design Notes"]);
    expect(targets.map((t) => t.value)).toEqual(["Inbox", "Ideas", "Design Notes"]);
    // What the capture call takes: the space, and a folder inside it.
    expect(targets[1]).toMatchObject({ space: "jott.notes", folder: "Ideas" });
    expect(targets[2]).toMatchObject({ space: "Design Notes", folder: "Inbox" });
  });

  test("with the fixed space hidden, only the user's note spaces remain", () => {
    const targets = noteTargets({ ...SETUP, fixedShown: false });
    expect(targets.map((t) => t.value)).toEqual(["Design Notes"]);
  });

  test("a task space is never a place for a note", () => {
    const targets = noteTargets({ ...SETUP, folders: [], spaces: SETUP.spaces });
    expect(targets.some((t) => t.space === "Design/Tasks")).toBe(false);
  });
});

describe("quickNoteTarget", () => {
  test("answers the stored choice, and falls back to the first offered", () => {
    const targets = noteTargets(SETUP);
    expect(quickNoteTarget("Design Notes", targets)?.space).toBe("Design Notes");
    // A folder that was deleted (or a value from another notebook): the
    // fixed Inbox takes it, never a crash.
    expect(quickNoteTarget("gone", targets)?.value).toBe("Inbox");
  });

  test("with nowhere to go it says so, and the capture is the one to close", () => {
    expect(quickNoteTarget("Inbox", [])).toBeNull();
  });
});
