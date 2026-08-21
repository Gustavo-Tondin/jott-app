// The task inspector — every field of a task, and what each one sends the bridge.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens, task } from "../test/screens.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

const { default: TaskInspector } = await import("../components/TaskInspector.svelte");

beforeEach(resetScreens);

describe("TaskInspector", () => {
  // saveDelay 0 so the debounce resolves on the next tick instead of the test
  // sitting through half a second of nothing.
  const props = (task, extra = {}) => ({
    task,
    list: "jott.tasks/Compras.md",
    readOnly: false,
    saveDelay: 0,
    onSaved: noop,
    onError: noop,
    onClose: noop,
    ...extra,
  });

  /// The fields of the last `set_task_fields` call.
  const lastSave = () =>
    invoke.mock.calls.filter(([cmd]) => cmd === "set_task_fields").at(-1)[1];

  const saveCount = () =>
    invoke.mock.calls.filter(([cmd]) => cmd === "set_task_fields").length;

  // Reestruturação 2026-07-30: tags are added through the TagPicker (pick an
  // existing one or create with a colour), not a free text field. This drives
  // its create flow — the simplest way for a test to add a named tag, which is
  // also a convenient generic "make an edit".
  async function addTag(name) {
    await userEvent.click(screen.getByRole("button", { name: "add tag" }));
    await userEvent.type(screen.getByPlaceholderText("New tag name"), `${name}{enter}`);
  }

  test("opening a task writes nothing at all", async () => {
    // The whole point of the lazy id, and now of the auto-save too: looking at
    // a task must leave the `.md` untouched. Saving on open would give every
    // hand-written task an id just for having been clicked.
    bridge({ ensure_task_id: "new1", set_task_fields: null });

    render(TaskInspector, { props: props(task(null, "Escrita à mão")) });

    await screen.findByDisplayValue("Escrita à mão");
    await new Promise((r) => setTimeout(r, 20));
    expect(invoke).not.toHaveBeenCalled();
  });

  test("the footer's list button moves the task to another list", async () => {
    // The footer says where the task lives AND is how it is moved, so it is a
    // button that opens the lists — not a bare select (user call 2026-08-05).
    bridge({ move_task: {}, set_task_fields: null });
    const moved = [];
    render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), {
        lists: [
          // The space label travels with the address (the core sends it),
          // so a menu never has to read it off the folder.
          { path: "jott.tasks/Compras.md", name: "Compras", space: "Tasks" },
          { path: "jott.tasks/Casa.md", name: "Casa", space: "Tasks" },
        ],
        onMoved: (path) => moved.push(path),
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: "move to list" }));
    // The row reads `Tasks/`**Casa** — the space in grey, the list in ink,
    // so two lists both called "Inbox" are told apart without the row turning
    // into a file path (user call, 2026-08-06).
    const row = (await screen.findByText("Casa")).closest("button");
    expect(within(row).getByText("Tasks/")).toBeTruthy();
    await userEvent.click(row);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("move_task", {
        from: "jott.tasks/Compras.md",
        id: "a1",
        to: "jott.tasks/Casa.md",
      });
    });
    expect(moved).toEqual(["jott.tasks/Casa.md"]);
  });

  test("there is no save button to forget", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });

    await screen.findByDisplayValue("Comprar leite");
    expect(screen.queryByText("Save")).toBeNull();
  });

  test("the ⋮ menu duplicates the task", async () => {
    bridge({ duplicate_task: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });
    await screen.findByDisplayValue("Comprar leite");

    await userEvent.click(screen.getByLabelText("task options"));
    await userEvent.click(screen.getByText("Duplicate task"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("duplicate_task", {
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
  });

  test("editing saves on its own", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });
    await addTag("casa");

    await waitFor(() => expect(lastSave().fields.tags).toEqual(["casa"]));
    expect(lastSave().id).toBe("a1");
  });

  test("the first edit is what earns the id", async () => {
    bridge({
      list_tasks: [task(null, "Escrita à mão")],
      ensure_task_id: "new1",
      set_task_fields: null,
    });

    render(TaskInspector, { props: props(task(null, "Escrita à mão")) });
    await addTag("casa");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("ensure_task_id", {
        list: "jott.tasks/Compras.md",
        position: 0,
      }),
    );
    expect(lastSave().id).toBe("new1");
  });

  test("a second edit does not ask for a second id", async () => {
    // The screen above still holds the id-less copy it selected. Looking the
    // position up again would find nothing — the task has an id by now — and
    // the second write would fail with taskNotFound.
    bridge({
      list_tasks: [task(null, "Escrita à mão")],
      ensure_task_id: "new1",
      set_task_fields: null,
    });

    render(TaskInspector, { props: props(task(null, "Escrita à mão")) });

    await addTag("casa");
    await waitFor(() => expect(saveCount()).toBe(1));
    await addTag("obra");
    await waitFor(() => expect(saveCount()).toBe(2));

    expect(invoke.mock.calls.filter(([cmd]) => cmd === "ensure_task_id").length).toBe(1);
  });

  test("picking a day in the calendar saves that date", async () => {
    // The custom picker seeds on the current value, so a task due in August
    // opens on August and clicking day 1 must save the 1st of that month.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite", { due: "2026-08-15" })),
    });

    await userEvent.click(await screen.findByLabelText("Due date"));
    await userEvent.click(screen.getByRole("button", { name: "1" }));

    await waitFor(() => expect(lastSave().fields.due).toBe("2026-08-01"));
  });

  test("the date has its own way to be removed", async () => {
    // The picker can set a date but has no gesture for "none", so without
    // this button a date could be changed forever and never taken off.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite", { due: "2026-07-25" })),
    });

    await userEvent.click(await screen.findByLabelText("clear date"));

    await waitFor(() => expect(lastSave().fields.due).toBe(null));
  });

  test("no clear button is offered when there is no date", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });

    await screen.findByLabelText("Due date");
    expect(screen.queryByLabelText("clear date")).toBeNull();
  });

  test("typing in the description still saves it as lines", async () => {
    // The description swapped its textarea for the plain editor (2026-08-19,
    // so it can carry `[[note]]` references). The editor is stubbed here, as
    // it is for notes — what this guards is the wiring: what is typed reaches
    // the draft and goes over the bridge as lines, references included.
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });

    const field = await screen.findByLabelText("Description");
    await userEvent.type(field, "Ver [[[[Ideias]]");

    await waitFor(() =>
      expect(lastSave().fields.description).toEqual(["Ver [[Ideias]]"]),
    );
  });

  test("choosing a day closes the calendar", async () => {
    // The popup must dismiss itself once a day is picked — the whole reason it
    // replaced the native picker, which stayed open on top of the panel.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite", { due: "2026-08-15" })),
    });

    await userEvent.click(await screen.findByLabelText("Due date"));
    expect(screen.queryByText("August 2026")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "1" }));

    expect(screen.queryByText("August 2026")).toBeNull();
    await waitFor(() => expect(lastSave().fields.due).toBe("2026-08-01"));
  });

  test("a tag with spaces is stored as a single token", async () => {
    // A loose word on the metadata line stops it from being all-tokens, and
    // the next read turns the whole line into a description — losing the
    // date, the priority and the other tags with it.
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });
    await addTag("casa nova");

    await waitFor(() => expect(lastSave().fields.tags).toEqual(["casa-nova"]));
  });

  test("the priority a task already has is the one showing", async () => {
    // The draft holds the option's own string (services/taskFields.js): a
    // `<select>` matches its options by string, so a numeric draft would leave
    // the row blank on a task that HAS a priority — and the next save would
    // then clear it. What goes back over the bridge is the number.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Pagar boleto", { priority: 2 })),
    });

    const select = await screen.findByDisplayValue("medium");
    await userEvent.selectOptions(select, "high");

    await waitFor(() => expect(lastSave().fields.priority).toBe(1));
  });

  test("repeat travels in the written form, never as an object", async () => {
    // The bridge hands back { every, unit } but only parses `every-2-weeks`.
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(
        task("a1", "Regar plantas", { repeat: { every: 2, unit: "week" } }),
      ),
    });
    await addTag("casa");

    await waitFor(() => expect(lastSave().fields.repeat).toBe("every-2-weeks"));
  });

  test("a single repetition drops the count", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(
        task("a1", "Regar plantas", { repeat: { every: 1, unit: "day" } }),
      ),
    });
    await addTag("casa");

    await waitFor(() => expect(lastSave().fields.repeat).toBe("every-day"));
  });

  test("subtasks survive the round trip", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(
        task("a1", "Obra", { subtasks: [{ text: "Cimento", done: true }] }),
      ),
    });
    await userEvent.type(
      await screen.findByPlaceholderText("New subtask…"),
      "Areia{enter}",
    );

    await waitFor(() =>
      expect(lastSave().fields.subtasks).toEqual([
        { text: "Cimento", done: true },
        { text: "Areia", done: false },
      ]),
    );
  });

  test("the repeat count is hidden until a unit is chosen", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Regar plantas")) });

    await screen.findByDisplayValue("Regar plantas");
    // No unit yet → the count is not shown at all (not merely disabled).
    expect(screen.queryByLabelText("every")).toBeNull();
  });

  test("choosing a repeat unit reveals the count", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(
        task("a1", "Regar plantas", { repeat: { every: 2, unit: "week" } }),
      ),
    });

    expect(await screen.findByLabelText("every")).toBeTruthy();
  });

  test("the sun sends the task to My Day", async () => {
    bridge({ pull_into_period: true, set_task_fields: null });

    render(TaskInspector, { props: props(task("a1", "Comprar leite")) });

    await userEvent.click(await screen.findByLabelText("Send to My Day"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("pull_into_period", {
        period: "day",
        list: "jott.tasks/Compras.md",
        id: "a1",
      }),
    );
  });

  test("selecting another task replaces the draft", async () => {
    bridge({ set_task_fields: null });

    const { rerender } = render(TaskInspector, {
      props: props(task("a1", "Comprar leite")),
    });
    await screen.findByDisplayValue("Comprar leite");

    await rerender(props(task("b2", "Pagar boleto")));

    expect(await screen.findByDisplayValue("Pagar boleto")).toBeTruthy();
    expect(screen.queryByDisplayValue("Comprar leite")).toBeNull();
  });

  test("switching task mid-edit still saves what was typed, to the right task", async () => {
    // The dangerous moment of an auto-save: a pending write belongs to the
    // task it was typed into, not to whatever is on screen when it lands.
    bridge({ set_task_fields: null });

    const { rerender } = render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), { saveDelay: 10_000 }),
    });
    await addTag("casa");

    await rerender(props(task("b2", "Pagar boleto"), { saveDelay: 10_000 }));

    await waitFor(() => expect(saveCount()).toBe(1));
    expect(lastSave().id).toBe("a1");
    expect(lastSave().fields.tags).toEqual(["casa"]);
  });

  test("closing with an edit pending still saves it", async () => {
    bridge({ set_task_fields: null });

    const { unmount } = render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), { saveDelay: 10_000 }),
    });
    await addTag("casa");

    unmount();

    await waitFor(() => expect(saveCount()).toBe(1));
    expect(lastSave().fields.tags).toEqual(["casa"]);
  });

  test("a failed write is retried by the next edit, not counted as saved", async () => {
    let attempts = 0;
    const errors = [];
    bridge({
      set_task_fields: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject({ kind: "io", message: "disco cheio" })
          : Promise.resolve(null);
      },
    });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), {
        onError: (e) => errors.push(e),
      }),
    });
    await addTag("casa");
    await waitFor(() => expect(errors.length).toBe(1));

    await addTag("obra");
    // The retry carries the tag the failed write was meant to persist.
    await waitFor(() => expect(lastSave().fields.tags).toEqual(["casa", "obra"]));
  });

  test("a read-only notebook cannot be edited at all", async () => {
    bridge({ set_task_fields: null });

    render(TaskInspector, {
      props: props(task("a1", "Comprar leite"), { readOnly: true }),
    });

    await screen.findByDisplayValue("Comprar leite");
    expect(screen.queryByPlaceholderText("New tag…")).toBeNull();
    expect(screen.getByLabelText("task name").disabled).toBe(true);
    expect(saveCount()).toBe(0);
  });

  // ---- attachments (2026-08-18) ----
  // "Add files" stopped being an honest placeholder: the file lives in the
  // notebook's library and the task points at it with a Markdown link.

  const withFiles = (extra = {}) => ({ root: "/home/gus/Caderno", ...extra });

  test("attaching a file from the library saves a link on the task", async () => {
    bridge({
      set_task_fields: null,
      assets: [{ path: "assets/nota.pdf", name: "nota.pdf", size: 10, modified: 1, image: false }],
    });

    render(TaskInspector, { props: props(task("a1", "Enviar proposta"), withFiles()) });

    await userEvent.click(await screen.findByText("Add files"));
    // The picker offers what the library holds, image or not.
    await userEvent.click(await screen.findByTitle("nota.pdf"));

    await waitFor(() =>
      expect(lastSave().fields.files).toEqual([
        { label: "nota.pdf", address: "assets/nota.pdf" },
      ]),
    );
    // And the chip is on the panel, named after the file.
    expect(screen.getByText("nota.pdf")).toBeTruthy();
  });

  // The engine's own semantics, measured in WebKit 2.4.1 (the app's Linux
  // webview) before this test was written: resetting a file input CLEARS the
  // very `FileList` object the handler is holding — WebKit's
  // `FileInputType::setValue` calls `m_fileList->clear()`, while Blink swaps
  // in a fresh empty list. A handler that resets first and reads afterwards
  // imports nothing, in silence, on Linux only.
  function webkitFileInput(input, files) {
    const held = [...files];
    held.item = (i) => held[i] ?? null;
    Object.defineProperty(input, "files", { configurable: true, get: () => held });
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => (held.length ? held[0].name : ""),
      set: () => (held.length = 0),
    });
  }

  test("importing a file from the picker survives the input being reset", async () => {
    const imported = [];
    bridge({
      set_task_fields: null,
      assets: () => imported.map((name) => ({ path: `assets/${name}`, name, size: 4, modified: 1, image: true })),
      import_asset: ({ name }) => {
        imported.push(name);
        return `assets/${name}`;
      },
    });

    const { container } = render(TaskInspector, {
      props: props(task("a1", "Enviar proposta"), withFiles()),
    });
    await userEvent.click(await screen.findByText("Add files"));

    const input = await waitFor(() => {
      const found = container.ownerDocument.querySelector(".asset-picker__input");
      if (!found) throw new Error("no file input");
      return found;
    });
    webkitFileInput(input, [new File(["png!"], "foto.png", { type: "image/png" })]);
    await fireEvent.change(input);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("import_asset", {
        name: "foto.png",
        // "png!" in base64 — the bytes the bridge decodes.
        data: "cG5nIQ==",
      }),
    );
    // And the file it just imported is the one attached, without a second ask.
    await waitFor(() =>
      expect(lastSave().fields.files).toEqual([
        { label: "foto.png", address: "assets/foto.png" },
      ]),
    );
  });

  test("a task opens with the files it already has, and can drop one", async () => {
    bridge({ set_task_fields: null, open_asset: null });
    const attached = task("a1", "Enviar proposta", {
      files: [{ label: "o contrato assinado", address: "assets/contrato.pdf" }],
    });

    render(TaskInspector, { props: props(attached, withFiles()) });

    // The LABEL from the file, not the address: someone may have written it.
    await userEvent.click(await screen.findByText("o contrato assinado"));
    expect(invoke).toHaveBeenCalledWith("open_asset", { path: "assets/contrato.pdf" });

    await userEvent.click(screen.getByLabelText("Remove attachment"));
    await waitFor(() => expect(lastSave().fields.files).toEqual([]));
  });

  test("attaching the same file twice says nothing new", async () => {
    bridge({
      set_task_fields: null,
      assets: [{ path: "assets/nota.pdf", name: "nota.pdf", size: 10, modified: 1, image: false }],
    });
    const attached = task("a1", "Enviar proposta", {
      files: [{ label: "nota.pdf", address: "assets/nota.pdf" }],
    });

    render(TaskInspector, { props: props(attached, withFiles()) });
    await userEvent.click(await screen.findByText("Add files"));
    await userEvent.click(await screen.findByTitle("nota.pdf"));

    // Nothing was written: the address IS the attachment, and two links to one
    // file say nothing new.
    expect(saveCount()).toBe(0);
  });

  test("a read-only notebook shows the attachments and offers no way to change them", async () => {
    const attached = task("a1", "Enviar proposta", {
      files: [{ label: "nota.pdf", address: "assets/nota.pdf" }],
    });

    render(TaskInspector, { props: props(attached, withFiles({ readOnly: true })) });

    expect(await screen.findByText("nota.pdf")).toBeTruthy();
    expect(screen.queryByText("Add files")).toBeNull();
    expect(screen.queryByLabelText("Remove attachment")).toBeNull();
  });
});
