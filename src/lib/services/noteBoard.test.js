import { describe, expect, it } from "vitest";
import { board, GROUP_PREVIEW } from "./noteBoard.js";

const note = (path, folder = "") => ({ path, folder, title: path, preview: "" });

const NOTES = [
  note("solta.md", ""),
  note("Inbox/ideia.md", "Inbox"),
  note("Inbox/outra.md", "Inbox"),
  note("Clientes/acme.md", "Clientes"),
  note("Clientes/bosch.md", "Clientes"),
  note("Clientes/2026/contrato.md", "Clientes/2026"),
  note("Receitas/bolo.md", "Receitas"),
];
const FOLDERS = ["Clientes", "Clientes/2026", "Inbox", "Receitas"];

describe("the board at the root", () => {
  const { cards, groups, parent } = board(NOTES, FOLDERS, "", "Inbox");

  it("draws the loose notes and the inbox's as the same cards", () => {
    // Every note the app files goes to Inbox/. A card for that folder would be
    // one card holding the whole board.
    expect(cards.map((n) => n.path)).toEqual([
      "solta.md",
      "Inbox/ideia.md",
      "Inbox/outra.md",
    ]);
  });

  it("draws a card for every other top-level folder", () => {
    expect(groups.map((g) => g.name)).toEqual(["Clientes", "Receitas"]);
  });

  it("counts everything below a folder, not just its first level", () => {
    const clientes = groups.find((g) => g.name === "Clientes");
    expect(clientes.count).toBe(3);
    // ...while the small cards it draws are only what is directly inside.
    expect(clientes.notes.map((n) => n.path)).toEqual([
      "Clientes/acme.md",
      "Clientes/bosch.md",
    ]);
  });

  it("has nowhere to go up to", () => {
    expect(parent).toBe(null);
  });
});

describe("the board inside a folder", () => {
  const { cards, groups, parent } = board(NOTES, FOLDERS, "Clientes", "Inbox");

  it("draws that folder's notes and its subfolders", () => {
    expect(cards.map((n) => n.path)).toEqual(["Clientes/acme.md", "Clientes/bosch.md"]);
    expect(groups.map((g) => g.path)).toEqual(["Clientes/2026"]);
  });

  it("goes back up to where it came from", () => {
    expect(parent).toBe("");
    expect(board(NOTES, FOLDERS, "Clientes/2026").parent).toBe("Clientes");
  });
});

describe("edge cases the disk actually produces", () => {
  it("caps the small cards a folder draws", () => {
    const many = Array.from({ length: 9 }, (_, i) => note(`Muitas/n${i}.md`, "Muitas"));
    const [group] = board(many, ["Muitas"], "").groups;
    expect(group.notes).toHaveLength(GROUP_PREVIEW);
    expect(group.count).toBe(9);
  });

  it("survives a space with no inbox at all", () => {
    // A user space starts empty: no Inbox folder, notes written at its root.
    const own = [note("uma.md", "")];
    const { cards, groups } = board(own, [], "", "Inbox");
    expect(cards).toHaveLength(1);
    expect(groups).toHaveLength(0);
  });

  it("does not mistake a folder whose name merely starts the same", () => {
    const notes = [note("Cliente/x.md", "Cliente"), note("Clientes/y.md", "Clientes")];
    const [cliente] = board(notes, ["Cliente", "Clientes"], "").groups;
    expect(cliente.count).toBe(1);
  });
});
