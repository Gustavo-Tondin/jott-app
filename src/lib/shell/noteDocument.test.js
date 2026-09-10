import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import { bridge, callsTo, fails, resetBridge } from "../test/bridge.js";
import { confirmRequest, nameRequest, setConfirmPolicy } from "../services/dialog.js";
import { S } from "../services/strings.js";
import { hostOf, makeNoteDocument } from "./noteDocument.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

/// A shell in miniature: the state the factory reads and writes, with every
/// callback recorded.
function shell({ readOnly = false } = {}) {
  const state = {
    view: { kind: "note", folder: "jott.notes", path: "Inbox/Ideia.md" },
    note: { title: "Ideia", pinned: false, tags: ["a"], banner: null },
    picking: null,
    editor: {
      flushPending: vi.fn(() => Promise.resolve()),
      run: vi.fn(),
      insert: vi.fn(),
    },
  };
  const calls = {
    fail: vi.fn(),
    reload: vi.fn(),
    refreshNotebook: vi.fn(),
    replaceTabView: vi.fn(),
    closeActiveTab: vi.fn(),
    goTo: vi.fn(),
    showNote: vi.fn(),
    openSearchAt: vi.fn(),
  };
  const change = async (run, then) => {
    try {
      const result = await run();
      then?.(result);
    } catch (e) {
      calls.fail(e);
    }
  };
  const doc = makeNoteDocument({
    view: () => state.view,
    note: () => state.note,
    setNote: (next) => (state.note = next),
    editor: () => state.editor,
    readOnly: () => readOnly,
    change,
    picking: () => state.picking,
    pickImage: (purpose) => (state.picking = purpose),
    ...calls,
  });
  return { state, calls, doc };
}

beforeEach(() => {
  resetBridge();
  nameRequest.set(null);
  confirmRequest.set(null);
  setConfirmPolicy({ settings: {}, save: () => {} });
});

describe("hostOf", () => {
  it("reads the host, and keeps the whole address when it will not parse", () => {
    expect(hostOf("https://example.org/a/b.png")).toBe("example.org");
    expect(hostOf("not a url")).toBe("not a url");
  });
});

describe("the open note's document actions", () => {
  it("flush what is being typed before touching the file", async () => {
    const { state, calls, doc } = shell();
    bridge({ set_note_pinned: null });
    await doc.toggleNotePin();
    expect(state.editor.flushPending).toHaveBeenCalledTimes(1);
    expect(callsTo("set_note_pinned")).toEqual([
      { folder: "jott.notes", path: "Inbox/Ideia.md", pinned: true },
    ]);
    expect(state.note.pinned).toBe(true);
    expect(calls.reload).toHaveBeenCalledTimes(1);
  });

  it("clean the tags before writing them, and keep the note's record in step", async () => {
    const { state, doc } = shell();
    bridge({ set_note_tags: null });
    await doc.setNoteTags([" b ", "", "c"]);
    expect(callsTo("set_note_tags")[0].tags).toEqual(["b", "c"]);
    expect(state.note.tags).toEqual(["b", "c"]);
  });

  it("a new tag is saved to the catalogue first, then applied", async () => {
    const { state, calls, doc } = shell();
    bridge({ set_tag: null, set_note_tags: null });
    await doc.createNoteTag("novo");
    expect(callsTo("set_tag")).toEqual([{ name: "novo", color: null }]);
    expect(state.note.tags).toEqual(["a", "novo"]);
    expect(calls.refreshNotebook).toHaveBeenCalledTimes(1);
  });

  it("a banner is one line of the note, written through the same flush", async () => {
    const { state, doc } = shell();
    bridge({ set_note_banner: null });
    await doc.setNoteBanner("yellow");
    expect(callsTo("set_note_banner")[0].banner).toBe("yellow");
    expect(state.note.banner).toEqual({ kind: "color", value: "yellow" });
    expect(state.editor.flushPending).toHaveBeenCalledTimes(1);
  });

  it("the paperclip asks the shell for a file; every other button is the editor's", () => {
    const { state, doc } = shell();
    doc.runFormat("md.bold");
    expect(state.editor.run).toHaveBeenCalledWith("md.bold");
    expect(state.picking).toBeNull();
    doc.runFormat("md.attach");
    expect(state.picking).toBe("body");
  });

  it("what the picker chose goes where it was opened for", async () => {
    const { state, doc } = shell();
    bridge({ set_note_banner: null });
    state.picking = "body";
    doc.useImage("assets/a.png");
    expect(state.picking).toBeNull();
    expect(state.editor.insert).toHaveBeenCalledWith("[[/a.png]]");
    state.picking = "banner";
    doc.useImage("assets/b.png");
    await tick();
    expect(callsTo("set_note_banner")[0].banner).toBe("assets/b.png");
    // A card's banner hands the picker its own way back.
    const done = vi.fn();
    state.picking = done;
    doc.useImage("assets/c.png");
    expect(done).toHaveBeenCalledWith("assets/c.png");
    expect(state.picking).toBeNull();
  });

  it("files brought in are imported and embedded one per line", async () => {
    const { state, doc } = shell();
    bridge({ import_asset_from_path: ({ path }) => `assets/${path.split("/").pop()}` });
    await doc.addFilesToNote({ paths: ["/tmp/x.png", "/tmp/y.png"] });
    expect(state.editor.insert.mock.calls).toEqual([["[[/x.png]]\n"], ["[[/y.png]]\n"]]);
  });

  it("a gesture with nothing readable says what it carried", async () => {
    const { calls, doc } = shell();
    await doc.addFilesToNote({ types: ["text/html"] });
    expect(calls.fail).toHaveBeenCalledWith(S.noFileInGesture(["text/html"]));
  });

  it("a read-only notebook ignores what is dropped on it", async () => {
    const { state, calls, doc } = shell({ readOnly: true });
    await doc.addFilesToNote({ paths: ["/tmp/x.png"] });
    expect(state.editor.insert).not.toHaveBeenCalled();
    expect(calls.fail).not.toHaveBeenCalled();
  });

  it("a remote picture is asked for by host, and fetched only on yes", async () => {
    const { calls, doc } = shell();
    bridge({ import_asset_from_url: "assets/web.png" });
    const asked = doc.fetchRemoteImage("https://example.org/p.png");
    await tick();
    expect(get(confirmRequest).code).toBe("example.org");
    get(confirmRequest).resolve({ ok: false });
    expect(await asked).toBeNull();
    expect(callsTo("import_asset_from_url")).toEqual([]);

    const again = doc.fetchRemoteImage("https://example.org/p.png");
    await tick();
    get(confirmRequest).resolve({ ok: true });
    expect(await again).toBe("assets/web.png");
    expect(calls.reload).toHaveBeenCalledTimes(1);
  });

  it("a fetch that fails is reported, not thrown", async () => {
    const { calls, doc } = shell();
    bridge({ import_asset_from_url: fails("offline") });
    setConfirmPolicy({ settings: { confirmImageDownloads: false } });
    expect(await doc.fetchRemoteImage("https://example.org/p.png")).toBeNull();
    expect(calls.fail).toHaveBeenCalledTimes(1);
  });

  describe("opening a [[link]] by title", () => {
    const found = (notes) => bridge({ search: { notes, tasks: [] } });

    it("one exact match opens it", async () => {
      const { calls, doc } = shell();
      found([{ title: "Ideias", path: "Ideias.md", folder: "jott.notes" }]);
      await doc.openNoteByTitle("ideias");
      expect(calls.showNote).toHaveBeenCalledWith("Ideias.md", "jott.notes");
    });

    it("a partial match is not a match", async () => {
      const { calls, doc } = shell();
      found([{ title: "Ideias novas", path: "x.md", folder: "jott.notes" }]);
      await doc.openNoteByTitle("Ideias");
      expect(calls.showNote).not.toHaveBeenCalled();
      expect(calls.fail).toHaveBeenCalledWith(S.noteNotFound("Ideias"));
    });

    it("two of them hand the choice to the search box", async () => {
      const { calls, doc } = shell();
      found([
        { title: "Ideias", path: "a/Ideias.md", folder: "jott.notes" },
        { title: "Ideias", path: "b/Ideias.md", folder: "Design" },
      ]);
      await doc.openNoteByTitle("Ideias");
      expect(calls.openSearchAt).toHaveBeenCalledWith("Ideias");
      expect(calls.showNote).not.toHaveBeenCalled();
    });

    it("an empty title is nothing to look for", async () => {
      const { doc } = shell();
      await doc.openNoteByTitle("  ");
      expect(callsTo("search")).toEqual([]);
    });
  });

  it("renaming moves the tab to the new file", async () => {
    const { calls, doc } = shell();
    bridge({ rename_note: "Inbox/Plano.md" });
    const renaming = doc.renameCurrentNote();
    await tick();
    expect(get(nameRequest).value).toBe("Ideia");
    get(nameRequest).resolve(" Plano ");
    await renaming;
    expect(callsTo("rename_note")[0].title).toBe("Plano");
    expect(calls.replaceTabView).toHaveBeenCalledWith(
      { kind: "note", folder: "jott.notes", path: "Inbox/Ideia.md" },
      { kind: "note", folder: "jott.notes", path: "Inbox/Plano.md" },
    );
  });

  it("the same name, or a cancel, writes nothing", async () => {
    const { doc } = shell();
    const same = doc.renameCurrentNote();
    await tick();
    get(nameRequest).resolve("Ideia");
    await same;
    const cancelled = doc.renameCurrentNote();
    await tick();
    get(nameRequest).resolve(null);
    await cancelled;
    expect(callsTo("rename_note")).toEqual([]);
  });

  it("deleting closes the tab, once confirmed", async () => {
    const { calls, doc } = shell();
    bridge({ delete_note: null });
    const deleting = doc.deleteCurrentNote();
    await tick();
    get(confirmRequest).resolve({ ok: true });
    await deleting;
    expect(callsTo("delete_note")).toEqual([{ folder: "jott.notes", path: "Inbox/Ideia.md" }]);
    expect(calls.closeActiveTab).toHaveBeenCalledTimes(1);
  });

  it("moving follows the note to where it landed", async () => {
    const { calls, doc } = shell();
    bridge({ move_note_to_space: "Ideia.md" });
    await doc.moveOpenNote("Design", "");
    expect(callsTo("move_note_to_space")[0]).toMatchObject({ toSpace: "Design", toFolder: "" });
    expect(calls.goTo).toHaveBeenCalledWith({ kind: "note", folder: "Design", path: "Ideia.md" });
  });
});
