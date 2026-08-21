// The library of `assets/` — importing, renaming, deleting, seeing where a file is used.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { nameRequest } from "../services/dialog.js";
import { bridge, invoke } from "../test/bridge.js";
import { answerConfirm, noop, resetScreens } from "../test/screens.js";
import AssetsView from "../screens/AssetsView.svelte";

beforeEach(resetScreens);

describe("AssetsView", () => {
  const asset = (name, image = true) => ({
    path: `assets/${name}`,
    name,
    size: 2048,
    modified: 1,
    image,
  });

  const props = (extra = {}) => ({
    root: "/home/gus/Caderno",
    readOnly: false,
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
    ...extra,
  });

  // ---- files brought to the library itself (2026-08-19) ----
  // This screen IS the library, so it is the most obvious thing in the app to
  // hand a file to — and it was the one place that did not accept one.

  test("a file dropped on the library is imported", async () => {
    bridge({ assets: [], asset_usage: {}, import_asset_from_path: "assets/foto.webp" });
    const { container } = render(AssetsView, { props: props() });
    await screen.findByText("No files yet.");

    await fireEvent.drop(container.querySelector(".assets-view"), {
      dataTransfer: {
        files: [],
        types: ["text/uri-list"],
        getData: () => "",
        items: [
          {
            kind: "string",
            type: "text/html",
            // The shape WebKit actually hands a drag over in — the address is
            // the anchor's TEXT, while `text/uri-list` sits empty beside it.
            getAsString: (cb) => cb('<a style="color: rgb(0,0,0)">file:///home/gus/foto.webp</a>'),
          },
        ],
      },
    });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("import_asset_from_path", {
        path: "/home/gus/foto.webp",
      }),
    );
  });

  test("a pasted file falls back to the system clipboard", async () => {
    // Every accessor the webview has answers empty for a pasted file
    // (measured 2026-08-19); the system is the only one that knows.
    bridge({
      assets: [],
      asset_usage: {},
      clipboard_files: ["file:///home/gus/nota.pdf"],
      import_asset_from_path: "assets/nota.pdf",
    });
    const { container } = render(AssetsView, { props: props() });
    await screen.findByText("No files yet.");

    await fireEvent.paste(container.querySelector(".assets-view"), {
      clipboardData: { files: [], types: ["text/uri-list"], getData: () => "", items: [] },
    });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("import_asset_from_path", {
        path: "/home/gus/nota.pdf",
      }),
    );
  });

  test("renaming a file goes through the core, which repoints every link", async () => {
    bridge({
      assets: [asset("foto.png")],
      asset_usage: {},
      rename_asset: "assets/ferias.png",
    });

    render(AssetsView, { props: props() });
    await userEvent.click(await screen.findByLabelText("Rename"));

    const { get } = await import("svelte/store");
    await waitFor(() => expect(get(nameRequest)).toBeTruthy());
    get(nameRequest).resolve("ferias");
    nameRequest.set(null);

    // The name goes over as typed — the core is what decides that a missing
    // extension means the old one.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("rename_asset", {
        path: "assets/foto.png",
        name: "ferias",
      }),
    );
  });

  test("a picture that is only on the web is handed up to be asked about", async () => {
    // The screen does not make network requests of its own: explaining the
    // connection is the shell's, and there is one dialog for it.
    const asked = vi.fn(() => Promise.resolve("assets/daoz-51.jpg"));
    bridge({ assets: [], asset_usage: {} });

    const { container } = render(AssetsView, { props: props({ onRemoteImage: asked }) });
    await screen.findByText("No files yet.");

    await fireEvent.paste(container.querySelector(".assets-view"), {
      clipboardData: {
        files: [],
        types: ["text/html"],
        getData: () => "",
        items: [
          {
            kind: "string",
            type: "text/html",
            getAsString: (cb) => cb('<img src="https://cdnb.artstation.com/daoz-51.jpg?17">'),
          },
        ],
      },
    });

    await waitFor(() =>
      expect(asked).toHaveBeenCalledWith("https://cdnb.artstation.com/daoz-51.jpg?17"),
    );
  });

  // ---- what uses a file (2026-08-19) ----
  // The fact that makes deleting safe, and the way to what would break.

  const usedBy = (title, extra = {}) => ({
    kind: "note",
    path: "Inbox/com imagem.md",
    folder: "jott.notes",
    id: null,
    title,
    snippet: "",
    space: "Notes",
    container: "Inbox",
    done: false,
    ...extra,
  });

  test("says which files nothing points at", async () => {
    bridge({
      assets: [asset("usada.png"), asset("esquecida.png")],
      asset_usage: { "assets/usada.png": [usedBy("com imagem")] },
    });

    render(AssetsView, { props: props() });

    await screen.findByText("Not used");
    expect(screen.getByText("Used in 1 place")).toBeTruthy();
  });

  test("opens what uses one", async () => {
    const opened = vi.fn();
    bridge({
      assets: [asset("usada.png")],
      asset_usage: { "assets/usada.png": [usedBy("com imagem")] },
    });

    render(AssetsView, { props: props({ onOpenNote: opened }) });

    // The places are a detail of the row: asked for, not always on screen.
    await userEvent.click(await screen.findByText("Used in 1 place"));
    await userEvent.click(screen.getByText("com imagem"));

    expect(opened).toHaveBeenCalledWith("Inbox/com imagem.md", "jott.notes", {
      newTab: false,
    });

    // And beside the library, by the middle button: finding where a picture is
    // used is a question asked in passing, like a search hit. (Going anywhere
    // folds the places away, so they are asked for again.)
    await userEvent.click(await screen.findByText("Used in 1 place"));
    await fireEvent(
      screen.getByText("com imagem"),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    expect(opened).toHaveBeenLastCalledWith("Inbox/com imagem.md", "jott.notes", {
      newTab: true,
    });
  });

  test("a task that attaches it is a place too", async () => {
    const opened = vi.fn();
    bridge({
      assets: [asset("nota.pdf", false)],
      asset_usage: {
        "assets/nota.pdf": [
          usedBy("Enviar proposta", {
            kind: "task",
            path: "jott.tasks/task-list.md",
            folder: "",
            id: "a1",
            space: "Tasks",
          }),
        ],
      },
    });

    render(AssetsView, { props: props({ onOpenTask: opened }) });

    await userEvent.click(await screen.findByText("Used in 1 place"));
    await userEvent.click(screen.getByText("Enviar proposta"));

    expect(opened).toHaveBeenCalledWith("jott.tasks/task-list.md", "a1");
  });

  test("lists the library, with the name a note would call the file by", async () => {
    bridge({ assets: [asset("foto.png")] });

    render(AssetsView, { props: props() });

    expect(await screen.findByText("foto.png")).toBeTruthy();
    // `/foto.png` — the piece that goes between a pair of brackets. Not the
    // machine path, which would break on another computer, and not
    // `assets/foto.png`, which is where the file lives (user call,
    // 2026-08-19).
    expect(screen.getByText("/foto.png")).toBeTruthy();
    expect(screen.getByText("1 file")).toBeTruthy();
  });

  test("deleting asks first and goes through the core", async () => {
    bridge({ assets: [asset("foto.png")], asset_usage: {}, delete_asset: null });

    render(AssetsView, { props: props() });
    userEvent.click(await screen.findByLabelText("Delete file"));
    const asked = await answerConfirm();

    // Nothing is showing this one, so the question is only about the file.
    expect(asked.detail).toContain("trash");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_asset", { path: "assets/foto.png" }),
    );
  });

  test("deleting a file a note is showing says so, and how many", async () => {
    // The consequence is somewhere else, and the screen already knows it: a
    // question that does not say which links break is a question that hid the
    // only fact that mattered (user call, 2026-08-19).
    bridge({
      assets: [asset("foto.png")],
      asset_usage: { "assets/foto.png": [usedBy("com imagem"), usedBy("outra")] },
      delete_asset: null,
    });

    render(AssetsView, { props: props() });
    userEvent.click(await screen.findByLabelText("Delete file"));
    const asked = await answerConfirm(false);

    expect(asked.detail).toContain("2 notes and tasks");
    expect(asked.detail).toContain("stop working");
    // Cancelled means cancelled.
    await new Promise((r) => setTimeout(r, 10));
    expect(invoke.mock.calls.some(([cmd]) => cmd === "delete_asset")).toBe(false);
  });

  test("a read-only notebook can look but not add or delete", async () => {
    bridge({ assets: [asset("foto.png")] });

    render(AssetsView, { props: props({ readOnly: true }) });

    await screen.findByText("foto.png");
    expect(screen.queryByText("Add files")).toBeNull();
    expect(screen.queryByLabelText("Delete file")).toBeNull();
  });
});
