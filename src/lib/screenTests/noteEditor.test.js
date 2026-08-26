// The note editor screen: auto-save, flush on close, read-only.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens } from "../test/screens.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

const { default: NoteEditor } = await import("../components/NoteEditor.svelte");

beforeEach(resetScreens);

describe("NoteEditor", () => {
  const props = (extra = {}) => ({
    folder: "Notes",
    path: "Inbox/Ideia.md",
    readOnly: false,
    saveDelay: 0,
    onSaved: noop,
    onError: noop,
    onClose: noop,
    onRenamed: noop,
    ...extra,
  });

  const loaded = (body = "Corpo.\n") => ({
    read_note: {
      path: "Inbox/Ideia.md",
      title: "Ideia",
      body,
      pinned: false,
      created: "2026-07-21",
    },
    write_note: null,
  });

  test("opening a note writes nothing", async () => {
    // Same promise as the lazy task id: looking must not touch the file.
    bridge(loaded());

    render(NoteEditor, { props: props() });
    await screen.findByDisplayValue("Corpo.");
    await new Promise((r) => setTimeout(r, 20));

    expect(invoke.mock.calls.some(([cmd]) => cmd === "write_note")).toBe(false);
  });

  // ---- files brought into the note (2026-08-19) ----
  //
  // The gesture is handled on the note's WRAPPER, in the capture phase, and
  // both halves were learned from the running app: a dropped file lands on
  // the wrapper and never inside the editor, and CodeMirror handles a paste
  // itself before the event could bubble out. So the tests fire on the
  // wrapper, which is where a person's gesture actually arrives.

  const picture = () => new File(["png!"], "foto.png", { type: "image/png" });
  const bodyOf = (container) => container.querySelector(".note-editor__body");

  test("pasting a file hands it to the shell instead of pasting text", async () => {
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.paste(bodyOf(container), {
      clipboardData: { files: [picture()], types: ["Files"] },
    });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
    expect(brought.mock.calls[0][0].files[0].name).toBe("foto.png");
  });

  test("a file the desktop handed over as an address is read too", async () => {
    // The shape the app's own window actually sends (measured 2026-08-19):
    // no bytes, `text/uri-list` in the types, and `getData` answering empty —
    // so the item list is what has the address.
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.paste(bodyOf(container), {
      clipboardData: {
        files: [],
        types: ["text/uri-list"],
        getData: () => "",
        items: [
          {
            kind: "string",
            type: "text/uri-list",
            getAsString: (cb) => cb("file:///home/gus/f%C3%A9rias.jpg"),
          },
        ],
      },
    });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
    expect(brought.mock.calls[0][0].paths).toEqual(["/home/gus/férias.jpg"]);
  });

  test("a dragged file is read out of the html flavour", async () => {
    // Where the address actually is, for a drag (measured 2026-08-19):
    // WebKit hands over `<a …>file:///…</a>` while `text/uri-list` sits
    // empty beside it.
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.drop(bodyOf(container), {
      dataTransfer: {
        files: [],
        types: ["text/uri-list", "text/html"],
        getData: () => "",
        items: [
          { kind: "string", type: "text/uri-list", getAsString: (cb) => cb("") },
          {
            kind: "string",
            type: "text/html",
            getAsString: (cb) => cb('<a style="color: rgb(0,0,0)">file:///home/gus/foto.webp</a>'),
          },
        ],
      },
    });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
    expect(brought.mock.calls[0][0].paths).toEqual(["/home/gus/foto.webp"]);
  });

  test("a pasted file falls back to the system clipboard", async () => {
    // For a paste there is nothing in the webview at all — no bytes, no
    // `getData`, no `getAsString`. The system is the only one that knows.
    //
    // The transfer here EMPTIES ITSELF once the handler returns, the way a
    // real one does (W3C Clipboard API: the store goes to Protected mode and
    // the `DataTransfer` is disconnected). Reading it after an await is what
    // kept the system from ever being asked, and a stub that stays readable
    // for ever cannot fail that way.
    bridge({ ...loaded(), clipboard_files: ["file:///home/gus/nota.pdf"] });
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    const clipboardData = {
      files: [],
      types: ["text/uri-list"],
      getData: () => "",
      items: [],
    };
    queueMicrotask(() => {
      clipboardData.types = [];
      clipboardData.items = [];
    });
    await fireEvent.paste(bodyOf(container), { clipboardData });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
    expect(brought.mock.calls[0][0].paths).toEqual(["/home/gus/nota.pdf"]);
  });

  test("dropping a file on the note hands it over too", async () => {
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.drop(bodyOf(container), {
      dataTransfer: { files: [picture()], types: ["Files"] },
    });

    await waitFor(() => expect(brought).toHaveBeenCalledTimes(1));
  });

  test("a drag carrying files is accepted, so the drop can arrive", async () => {
    // Without this `preventDefault` the drop never happens at all — and a
    // real drag out of a file manager announces itself as `text/uri-list`,
    // not as `Files`.
    bridge(loaded());
    const { container } = render(NoteEditor, { props: props({ onFiles: vi.fn() }) });
    await screen.findByDisplayValue("Corpo.");

    for (const types of [["Files"], ["text/uri-list"]]) {
      const carrying = new Event("dragover", { bubbles: true, cancelable: true });
      carrying.dataTransfer = { types };
      bodyOf(container).dispatchEvent(carrying);
      expect(carrying.defaultPrevented, types.join()).toBe(true);
    }
  });

  test("a paste of plain text is left alone", async () => {
    // The common case, and the one a greedy handler would break: not
    // answering is what lets the editor do its own job.
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, { props: props({ onFiles: brought }) });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.paste(bodyOf(container), {
      clipboardData: { files: [], types: ["text/plain"], getData: () => "olá" },
    });

    expect(brought).not.toHaveBeenCalled();
  });

  test("a read-only note takes nothing", async () => {
    bridge(loaded());
    const brought = vi.fn();

    const { container } = render(NoteEditor, {
      props: props({ onFiles: brought, readOnly: true }),
    });
    await screen.findByDisplayValue("Corpo.");
    await fireEvent.drop(bodyOf(container), {
      dataTransfer: { files: [picture()], types: ["Files"] },
    });

    expect(brought).not.toHaveBeenCalled();
  });

  test("editing saves on its own", async () => {
    bridge(loaded());

    render(NoteEditor, { props: props() });
    await userEvent.type(await screen.findByDisplayValue("Corpo."), " Mais.");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_note", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
        body: "Corpo.\n Mais.",
      }),
    );
  });

  test("closing with an edit pending still saves it", async () => {
    bridge(loaded());

    const { unmount } = render(NoteEditor, {
      props: props({ saveDelay: 10_000 }),
    });
    await userEvent.type(await screen.findByDisplayValue("Corpo."), "!");
    unmount();

    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "write_note")).toBe(true),
    );
  });

  test("a read-only notebook cannot be edited", async () => {
    bridge(loaded());

    render(NoteEditor, { props: props({ readOnly: true }) });

    const field = await screen.findByDisplayValue("Corpo.");
    expect(field.disabled).toBe(true);
  });

  test("the editor is writable once the note has loaded", async () => {
    // The bug this guards: the engine baked `readOnly || loading` in at
    // creation, and since a note is always loading at that instant, the
    // editor rendered the file beautifully and refused every keystroke.
    bridge(loaded());

    render(NoteEditor, { props: props() });

    const field = await screen.findByDisplayValue("Corpo.");
    await waitFor(() => expect(field.disabled).toBe(false));
  });

  test("the note reports its title, pin state and banner to the shell", async () => {
    // They belong to the page header above the tabs, not to a second bar
    // inside the page — and the banner is drawn by the shell too, above this
    // editor, because it is not part of the body being typed into.
    const seen = [];
    bridge(loaded());

    render(NoteEditor, { props: props({ onLoaded: (s) => seen.push(s) }) });

    await waitFor(() => expect(seen.length).toBe(1));
    // …and its properties, which the head draws under the title (2026-08-26).
    expect(seen[0]).toEqual({ pinned: false, title: "Ideia", banner: null, created: "2026-07-21", tags: [] });
    // And it draws no header of its own.
    expect(screen.queryByText("← notes")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  test("a note that has a banner hands it over the same way", async () => {
    const seen = [];
    bridge({
      ...loaded(),
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: null,
        banner: { kind: "color", value: "yellow" },
      },
    });

    render(NoteEditor, { props: props({ onLoaded: (s) => seen.push(s) }) });

    await waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0].banner).toEqual({ kind: "color", value: "yellow" });
    // The body it edits is the text WITHOUT the banner line — the core split
    // them, and typing must not put the head back into the prose.
    expect(await screen.findByDisplayValue("Corpo.")).toBeTruthy();
  });
});
