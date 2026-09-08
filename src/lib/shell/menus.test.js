import { describe, expect, test, vi } from "vitest";
import { bannerMenuOf, noteActionsOf, pageMenuOf, screenActionsOf } from "./menus.js";
import { S } from "../services/strings.js";
import { ACCENTS } from "../services/accent.js";

const labels = (items) => items.map((it) => it.label);
const on = () => true;
const off = () => false;

describe("screenActionsOf", () => {
  const base = {
    readOnly: false,
    isNote: false,
    hereLabel: "Design",
    renamableSpace: null,
    findHere: vi.fn(),
    revealHere: vi.fn(),
    renameSpace: vi.fn(),
    openReplace: vi.fn(),
  };

  test("a read-only notebook still finds and reveals, and nothing else", () => {
    expect(labels(screenActionsOf({ ...base, readOnly: true }))).toEqual([
      S.findInPlace("Design"),
      S.openInFileManager,
    ]);
  });

  test("a user space can be renamed from its own screen", () => {
    const renamableSpace = { path: "Design", name: "Design" };
    const items = screenActionsOf({ ...base, renamableSpace });
    expect(labels(items)[0]).toBe(S.renameThisSpace);
    items[0].run();
    expect(base.renameSpace).toHaveBeenCalledWith("Design", "Design");
  });

  test("a note finds in itself and can replace; a list cannot", () => {
    const note = screenActionsOf({ ...base, isNote: true });
    expect(labels(note)).toEqual([S.openInFileManager, S.findInNote, S.replaceInNote]);
    note[2].run();
    expect(base.openReplace).toHaveBeenCalled();
    expect(labels(screenActionsOf(base))).toEqual([S.openInFileManager, S.findInPlace("Design")]);
  });
});

describe("bannerMenuOf", () => {
  test("the eight colours, an image, and — with a banner on — remove", () => {
    const setBanner = vi.fn();
    const pickImage = vi.fn();
    const bare = bannerMenuOf({ banner: null, setBanner, pickImage });
    expect(bare.label).toBe(S.banner);
    expect(labels(bare.items)).toEqual([...ACCENTS.map((n) => S.colorName(n)), S.bannerImage]);
    const worn = bannerMenuOf({ banner: { value: "yellow" }, setBanner, pickImage });
    expect(labels(worn.items).at(-1)).toBe(S.removeBanner);
    expect(worn.items.find((it) => it.label === S.colorName("yellow")).checked).toBe(true);
    worn.items.at(-1).run();
    expect(setBanner).toHaveBeenCalledWith(null);
    worn.items[0].run();
    expect(setBanner).toHaveBeenCalledWith(ACCENTS[0]);
  });
});

describe("noteActionsOf", () => {
  const base = {
    readOnly: false,
    isNote: true,
    f: on,
    pinned: false,
    togglePin: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    bannerMenu: { label: S.banner, items: [] },
    pickImage: vi.fn(),
    fontSize: "",
    setFontSize: vi.fn(),
    compact: false,
    formatting: true,
    setFormatting: vi.fn(),
    formatBarMode: "",
  };

  test("nothing off a note, nothing read-only", () => {
    expect(noteActionsOf({ ...base, isNote: false })).toEqual([]);
    expect(noteActionsOf({ ...base, readOnly: true })).toEqual([]);
  });

  test("every feature-gated item goes with its switch", () => {
    const all = labels(noteActionsOf(base));
    expect(all).toEqual([
      S.pin,
      S.renameNote,
      S.deleteNote,
      S.banner,
      S.insertImage,
      S.noteTextSize,
      S.formatting,
    ]);
    expect(labels(noteActionsOf({ ...base, f: off }))).toEqual([
      S.renameNote,
      S.deleteNote,
      S.noteTextSize,
      S.formatting,
    ]);
  });

  test("the phone has no formatting switch, and the floating bar off names itself", () => {
    expect(labels(noteActionsOf({ ...base, compact: true }))).not.toContain(S.formatting);
    const sub = noteActionsOf({ ...base, formatBarMode: "off" }).at(-1).items;
    expect(labels(sub)).toEqual([S.formattingDocked, S.formattingHidden]);
    sub[1].run();
    expect(base.setFormatting).toHaveBeenCalledWith(false);
  });

  test("a pinned note offers to unpin", () => {
    expect(labels(noteActionsOf({ ...base, pinned: true }))[0]).toBe(S.unpin);
  });
});

describe("pageMenuOf", () => {
  const base = {
    noteActions: [{ label: "n" }],
    screenActions: [{ label: "s" }],
    readOnly: false,
    view: { kind: "home" },
    inbox: "jott.tasks/task-list.md",
    completed: "jott.tasks/completed.md",
    renameList: vi.fn(),
    deleteList: vi.fn(),
  };

  test("note actions first, screen actions last", () => {
    expect(labels(pageMenuOf(base))).toEqual(["n", "s"]);
  });

  test("only a user list is renamed or deleted from here", () => {
    const user = { kind: "list", list: "jott.tasks/Errands.md" };
    expect(labels(pageMenuOf({ ...base, view: user }))).toEqual([
      "n",
      S.renameList,
      S.deleteList,
      "s",
    ]);
    for (const list of [base.inbox, base.completed]) {
      expect(labels(pageMenuOf({ ...base, view: { kind: "list", list } }))).toEqual(["n", "s"]);
    }
    expect(labels(pageMenuOf({ ...base, view: user, readOnly: true }))).toEqual(["n", "s"]);
  });
});
