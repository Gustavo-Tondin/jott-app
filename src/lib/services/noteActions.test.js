import { beforeEach, describe, expect, test, vi } from "vitest";
import { bannerOf, noteCardMenu } from "./noteActions.js";

const entry = { path: "Inbox/ideia.md", title: "ideia", pinned: false };

/// Nothing is called here — the rows are what is under test.
const actions = {
  pin: vi.fn(),
  moveTo: vi.fn(),
  rename: vi.fn(),
  duplicate: vi.fn(),
  remove: vi.fn(),
};
const labels = (rows) => rows.map((row) => row.label);

/// Somewhere to move to, since that row only exists when there is.
const targets = [
  { label: "Notes", options: [{ label: "Ideas", value: JSON.stringify(["jott.notes", "Ideas"]) }] },
];

beforeEach(() => Object.values(actions).forEach((fn) => fn.mockClear()));

describe("bannerOf", () => {
  test("the value decides the kind, exactly as the core does", () => {
    expect(bannerOf("yellow")).toEqual({ kind: "color", value: "yellow" });
    expect(bannerOf("assets/foto.jpg")).toEqual({ kind: "image", value: "assets/foto.jpg" });
    expect(bannerOf(null)).toBeNull();
    expect(bannerOf("")).toBeNull();
  });
});

describe("noteCardMenu", () => {
  test("the five a card offers, in the board's order", () => {
    const rows = noteCardMenu({ entry, actions, space: "jott.notes", moveTargets: targets });
    expect(labels(rows)).toEqual(["Pin", "Move to…", "Rename", "Duplicate", "Delete"]);
  });

  test("renaming is offered on the card, not only on the open note", () => {
    const rows = noteCardMenu({ entry, actions, space: "Ideias" });
    rows.find((row) => row.label === "Rename").run();
    expect(actions.rename).toHaveBeenCalledWith("Ideias", entry);
  });

  test("every action names the space the card was drawn for", () => {
    // The Home looks INTO a space it does not live in, so the space is the
    // caller's answer and never the note's.
    const rows = noteCardMenu({ entry, actions, space: "Ideias" });
    rows.at(-1).run();
    expect(actions.remove).toHaveBeenCalledWith("Ideias", entry);
  });

  test("the pin row says which way it goes", () => {
    const pinned = { ...entry, pinned: true };
    expect(labels(noteCardMenu({ entry: pinned, actions, space: "x" }))[0]).toBe("Unpin");
  });

  test("pinning switched off takes the row out, not the rest", () => {
    const rows = noteCardMenu({
      entry,
      actions,
      space: "x",
      canPin: false,
      moveTargets: targets,
    });
    expect(labels(rows)).toEqual(["Move to…", "Rename", "Duplicate", "Delete"]);
  });

  test("nowhere to move means no row at all", () => {
    // Rather than a row that opens onto nothing.
    expect(
      labels(noteCardMenu({ entry, actions, space: "x", moveTargets: targets })),
    ).toContain("Move to…");
    expect(labels(noteCardMenu({ entry, actions, space: "x", moveTargets: [] }))).not.toContain(
      "Move to…",
    );
  });

  test("a move row carries the pair the bridge needs, and its group", () => {
    const rows = noteCardMenu({
      entry,
      actions,
      space: "jott.notes",
      moveTargets: [
        {
          label: "Notes",
          options: [{ label: "Ideas", value: JSON.stringify(["jott.notes", "Ideas"]) }],
        },
      ],
    });
    const move = rows.find((row) => row.items);
    expect(move.items[0].context).toBe("Notes");

    move.items[0].run();
    expect(actions.moveTo).toHaveBeenCalledWith(
      "jott.notes",
      entry,
      JSON.stringify(["jott.notes", "Ideas"]),
    );
  });

  test("a read-only notebook keeps only what is not a write", () => {
    const open = vi.fn();
    expect(
      labels(noteCardMenu({ entry, actions, space: "x", readOnly: true, openInNewTab: open })),
    ).toEqual(["Open in new tab"]);
    // And with no way to open in a tab either, an empty menu draws no ⋮.
    expect(noteCardMenu({ entry, actions, space: "x", readOnly: true })).toEqual([]);
  });

  test("opening in a new tab leads, when it is offered at all", () => {
    // The right button carries it; the ⋮ of a card does not — a card there is
    // already one click from opening.
    const rows = noteCardMenu({ entry, actions, space: "x", openInNewTab: vi.fn() });
    expect(labels(rows)[0]).toBe("Open in new tab");
  });
});
