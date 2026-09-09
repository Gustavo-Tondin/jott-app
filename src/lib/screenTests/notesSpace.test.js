// The notes board: cards, folders, selection, and the sub-functions that redraw it.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { nameRequest } from "../services/dialog.js";
import { bridge, invoke } from "../test/bridge.js";
import { answerConfirm, noop, noteFolder, place, resetScreens, showFolders } from "../test/screens.js";
import NotesSpace from "../spaces/NotesSpace.svelte";

beforeEach(resetScreens);

describe("NotesSpace", () => {
  const source = { kind: "notes", folder: "Notes", invalidFolder: false };

  const entry = (title, extra = {}) => ({
    path: `Inbox/${title}.md`,
    title,
    folder: "Inbox",
    preview: `preview of ${title}`,
    created: "2026-07-21",
    pinned: false,
    ...extra,
  });

  const props = (extra = {}) => ({
    source,
    readOnly: false,
    notesInbox: "Inbox",
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
    ...extra,
  });

  test("lists the notes of its own folder", async () => {
    bridge({ list_notes: [entry("Ideia")], note_folders: [noteFolder("Inbox")] });

    render(NotesSpace, { props: props() });

    expect(await screen.findByText("Ideia")).toBeTruthy();
    expect(screen.getByText("preview of Ideia")).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("list_notes", {
      folder: "Notes",
      query: "",
    });
  });

  test("draws the head of a note as markdown, never as syntax", async () => {
    // The card is where the preview actually meets the DOM, so this is the
    // test of it: the reader has its own (services/notePreview.test.js), and a
    // card that dropped the component would still pass that one.
    bridge({
      list_notes: [
        entry("Receita", { preview: "## Ingredientes\n\n- **duas** xícaras" }),
      ],
      note_folders: [noteFolder("Inbox")],
    });

    render(NotesSpace, { props: props() });

    const heading = await screen.findByText("Ingredientes");
    expect(heading.closest(".note-preview__heading")?.dataset.level).toBe("2");
    expect(screen.getByText("duas").className).toContain("note-preview__strong");
    // The marks are drawn, so they are not written.
    expect(screen.queryByText(/##/)).toBeNull();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  test("an empty board says so", async () => {
    // The screen's own search box went with the 2026-08-19 redraw: searching
    // in a place is Ctrl+F with this space as its scope (SearchDialog), and a
    // second field above the cards was a second answer to the same question.
    bridge({ list_notes: [], note_folders: [] });

    render(NotesSpace, { props: props() });
    expect(await screen.findByText("No notes yet.")).toBeTruthy();
    expect(screen.queryByLabelText("Search notes…")).toBeNull();
  });

  test("pinning goes through the core and reloads", async () => {
    // A button of its own beside the ⋮ (user call, 2026-08-19: "com a mesma
    // funcionalidade das tarefas"). A pin is a STATE, and a state has to be
    // readable off the card without opening a menu to ask.
    bridge({ list_notes: [entry("Ideia")], note_folders: [], set_note_pinned: null });

    render(NotesSpace, { props: props() });
    await userEvent.click(await screen.findByLabelText("Pin"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_note_pinned", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
        pinned: true,
      }),
    );
  });

  test("opening a note reports it upwards instead of embedding an editor", async () => {
    // A note becomes a document tab, the same as a list — deciding that is
    // the shell's business, not this screen's.
    const opened = [];
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    render(NotesSpace, {
      props: props({ onOpenNote: (path, folder) => opened.push([path, folder]) }),
    });
    await userEvent.click(await screen.findByText("Ideia"));

    expect(opened).toEqual([["Inbox/Ideia.md", "Notes"]]);
    expect(invoke.mock.calls.some(([cmd]) => cmd === "read_note")).toBe(false);
  });

  test("a card is a link: the middle button opens it beside what is open", async () => {
    // The same contract the sidebar's rows keep (shell/Sidebar.svelte): a
    // plain click follows, the middle button opens another tab. Which tab is
    // the shell's business — the board only says which door was used.
    const opened = [];
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    render(NotesSpace, {
      props: props({ onOpenNote: (path, folder, opts) => opened.push([path, folder, opts]) }),
    });
    await fireEvent(
      await screen.findByText("Ideia"),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );

    expect(opened).toEqual([["Inbox/Ideia.md", "Notes", { newTab: true }]]);
  });

  test("the right button offers the same door, above the card's own items", async () => {
    const opened = [];
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    render(NotesSpace, {
      props: props({ onOpenNote: (path, folder, opts) => opened.push([path, folder, opts]) }),
    });
    await fireEvent.contextMenu(await screen.findByText("Ideia"));

    // First row, then everything the ⋮ carries — a menu is read from the top.
    const rows = [...document.querySelectorAll(".context-menu button")].map((el) =>
      el.textContent.trim(),
    );
    expect(rows[0]).toBe("Open in new tab");
    expect(rows).toContain("Delete");

    await userEvent.click(screen.getByText("Open in new tab"));
    expect(opened).toEqual([["Inbox/Ideia.md", "Notes", { newTab: true }]]);
  });

  test("a read-only notebook still opens a note in a new tab", async () => {
    // Reading is still reading: a second tab writes nothing, so it is the one
    // row the right button keeps when every other one is gone.
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    render(NotesSpace, { props: props({ readOnly: true }) });
    await fireEvent.contextMenu(await screen.findByText("Ideia"));

    const rows = [...document.querySelectorAll(".context-menu button")].map((el) =>
      el.textContent.trim(),
    );
    expect(rows).toEqual(["Open in new tab"]);
  });

  test("the folder view filters to the folder being looked at", async () => {
    bridge({
      list_notes: [
        entry("Solta"),
        entry("Briefing", { path: "Clientes/Briefing.md", folder: "Clientes" }),
      ],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
    });

    render(NotesSpace, { props: props() });
    await showFolders();
    // The folder chip, not the card footer that also names the folder.
    await userEvent.click(screen.getByRole("button", { name: "Clientes" }));

    expect(await screen.findByText("Briefing")).toBeTruthy();
    expect(screen.queryByText("Solta")).toBeNull();
  });

  test("choosing a layout is saved in the space, and a saved one is opened", async () => {
    // The choice used to be session state and was lost on every screen change
    // (proposta §9-A, 2026-08-21). Now it is written to the space's own
    // `.space.json` and read back through the source.
    bridge({
      list_notes: [entry("Solta")],
      note_folders: [noteFolder("Inbox")],
    });
    const onSetLayout = vi.fn();

    render(NotesSpace, { props: props({ onSetLayout }) });
    await screen.findByText("Solta");
    await showFolders();
    expect(onSetLayout).toHaveBeenCalledWith("tree");
    // The click shows at once, before any refresh brings it back.
    expect(await screen.findByRole("button", { name: "Inbox" })).toBeTruthy();

    cleanup();
    // A space that saved `tree` opens in the tree, no click needed; the
    // notebook's default is only for a space that never chose.
    render(NotesSpace, {
      props: props({ source: { ...source, noteLayout: "tree" }, defaultLayout: "grid" }),
    });
    expect(await screen.findByRole("button", { name: "Inbox" })).toBeTruthy();

    cleanup();
    render(NotesSpace, { props: props({ defaultLayout: "tree" }) });
    expect(await screen.findByRole("button", { name: "Inbox" })).toBeTruthy();

    cleanup();
    // A read-only notebook still switches — for the session, nothing saved.
    const untouched = vi.fn();
    render(NotesSpace, { props: props({ readOnly: true, onSetLayout: untouched }) });
    await screen.findByText("Solta");
    await showFolders();
    expect(await screen.findByRole("button", { name: "Inbox" })).toBeTruthy();
    expect(untouched).not.toHaveBeenCalled();
  });

  test("a read-only notebook offers no way to write", async () => {
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    render(NotesSpace, { props: props({ readOnly: true }) });

    await screen.findByText("Ideia");
    // No quick-note bar, no pin, and no ⋮ on the card: every one of them
    // writes.
    expect(screen.queryByLabelText("Quick note…")).toBeNull();
    expect(screen.queryByLabelText("Pin")).toBeNull();
    expect(screen.queryByLabelText("note options")).toBeNull();
    await userEvent.click(screen.getByLabelText("space options"));
    expect(screen.queryByText("New note")).toBeNull();
  });

  // ---- the board redrawn (2026-08-18) ----

  test("a note's banner is drawn on its card, in the colour it names", async () => {
    bridge({
      list_notes: [entry("Ideia", { banner: { kind: "color", value: "6" } })],
      note_folders: [],
    });

    const { container } = render(NotesSpace, { props: props() });
    await screen.findByText("Ideia");

    const banner = container.querySelector(".note-card__banner");
    // The NAME becomes a var() of the palette, never a hex: which end of the
    // ramp shows is the region's call (services/accent.js).
    expect(banner.getAttribute("style")).toContain("var(--app-6-fill)");
  });

  test("a note with no banner has no block above its title", async () => {
    bridge({ list_notes: [entry("Ideia")], note_folders: [] });

    const { container } = render(NotesSpace, { props: props() });
    await screen.findByText("Ideia");
    expect(container.querySelector(".note-card__banner")).toBeNull();
  });

  test("a folder of notes is a card, and opening it shows what is inside", async () => {
    bridge({
      list_notes: [
        entry("Solta"),
        entry("Briefing", { path: "Clientes/Briefing.md", folder: "Clientes" }),
      ],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
    });

    render(NotesSpace, { props: props() });

    // On the board: the loose note as a card, the folder as a card of its own
    // — and the INBOX is not one of them (services/noteBoard.js).
    expect(await screen.findByText("Solta")).toBeTruthy();
    expect(screen.getByText("Clientes")).toBeTruthy();
    expect(screen.getByText("1 note")).toBeTruthy();
    expect(screen.queryByText("Inbox")).toBeNull();

    // Opening it does NOT leave the board (user call, 2026-08-19): the folder
    // unfolds over it, so what is behind is still there to go back to.
    await userEvent.click(screen.getByLabelText("open Clientes"));
    expect(await screen.findByText("preview of Briefing")).toBeTruthy();
    expect(screen.getByText("Solta")).toBeTruthy();

    // And it closes onto the same board.
    await userEvent.click(screen.getByLabelText("open Clientes"));
    expect(screen.queryByText("preview of Briefing")).toBeNull();
  });

  // ---- the quick note bar (2026-08-19) ----

  test("what is typed in the bar becomes the note's BODY, under a name the app gives", async () => {
    // The writer types the thing, not a file name (user call): asking for a
    // title first asks for the one thing they do not know yet.
    bridge({
      list_notes: [],
      note_folders: [],
      create_note: "Inbox/New note.md",
      write_note: null,
    });

    render(NotesSpace, { props: props() });
    await userEvent.type(await screen.findByLabelText("Quick note…"), "comprar cimento");
    await userEvent.click(screen.getByLabelText("Create the note"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_note", {
        folder: "Notes",
        inFolder: "Inbox",
        title: "New note",
      }),
    );
    expect(invoke).toHaveBeenCalledWith("write_note", {
      folder: "Notes",
      path: "Inbox/New note.md",
      body: "comprar cimento\n",
    });
  });

  test("Enter files the note and Shift+Enter is a new line", async () => {
    bridge({
      list_notes: [],
      note_folders: [],
      create_note: "Inbox/New note.md",
      write_note: null,
    });

    render(NotesSpace, { props: props() });
    const field = await screen.findByLabelText("Quick note…");
    await userEvent.type(field, "uma linha{Shift>}{Enter}{/Shift}outra");
    expect(invoke.mock.calls.some(([cmd]) => cmd === "create_note")).toBe(false);

    await userEvent.type(field, "{Enter}");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("write_note", {
        folder: "Notes",
        path: "Inbox/New note.md",
        body: "uma linha\noutra\n",
      }),
    );
  });

  test("+ on an empty bar makes a note and hands it over, ready to type in", async () => {
    // The other gesture entirely: nothing was typed here, so there is nothing
    // keeping the writer on this screen — the note opens with the cursor in
    // its body.
    const opened = [];
    bridge({ list_notes: [], note_folders: [], create_note: "Inbox/New note.md" });

    render(NotesSpace, {
      props: props({ onOpenNote: (path, folder, opts) => opened.push([path, folder, opts]) }),
    });
    await userEvent.click(await screen.findByLabelText("Create the note"));

    await waitFor(() =>
      expect(opened).toEqual([["Inbox/New note.md", "Notes", { fresh: true }]]),
    );
    expect(invoke.mock.calls.some(([cmd]) => cmd === "write_note")).toBe(false);
  });

  test("a card duplicates through the core", async () => {
    bridge({
      list_notes: [entry("Ideia")],
      note_folders: [],
      duplicate_note: "Inbox/Ideia 2.md",
    });

    render(NotesSpace, { props: props() });
    await userEvent.click(await screen.findByLabelText("note options"));
    await userEvent.click(await screen.findByText("Duplicate"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("duplicate_note", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
      }),
    );
  });

  test("a card moves to another place from its own ⋮", async () => {
    bridge({
      list_notes: [entry("Ideia")],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
      move_note_to_space: "Clientes/Ideia.md",
    });

    render(NotesSpace, { props: props() });
    await userEvent.click(await screen.findByLabelText("note options"));
    await userEvent.click(await screen.findByText("Move to…"));
    // The menu row, not the folder CARD of the same name behind it.
    await userEvent.click(
      (await screen.findAllByText("Clientes")).find((el) =>
        el.classList.contains("menu__link"),
      ),
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_note_to_space", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
        toSpace: "Notes",
        toFolder: "Clientes",
      }),
    );
  });

  test("a pinned note is drawn first, whatever the sort says", async () => {
    // Pinning outranks the arrangement, exactly as it does on a task list
    // (services/spaceOrder.js) — that is what "a mesma funcionalidade das
    // tarefas" means for a board.
    bridge({
      list_notes: [entry("Aaa"), entry("Zzz", { pinned: true })],
      note_folders: [],
    });

    const { container } = render(NotesSpace, {
      props: props({ source: { ...source, sort: "name" } }),
    });
    await screen.findByText("Zzz");
    const titles = [...container.querySelectorAll(".note-card__title")].map(
      (el) => el.textContent.trim(),
    );
    expect(titles).toEqual(["Zzz", "Aaa"]);
  });

  // ---- dragging a card (2026-08-19) ----

  test("a dragged card saves the arrangement it landed in", async () => {
    // It did nothing at all until now: the fixed Notes screen never passed an
    // `onSetOrder`, so the board dragged, called a handler nobody had given it
    // and redrew in the old order (user report).
    const saved = [];
    bridge({ list_notes: [entry("Aaa"), entry("Bbb")], note_folders: [] });

    const { container } = render(NotesSpace, {
      props: props({ onSetOrder: (order) => saved.push(order) }),
    });
    await screen.findByText("Aaa");

    const cards = [...container.querySelectorAll(".notes-space__item")];
    place(cards, 220);
    fireEvent.pointerDown(cards[0], { button: 0, pointerId: 1, clientX: 110, clientY: 60 });
    fireEvent.pointerMove(cards[0], { pointerId: 1, clientX: 110, clientY: 300 });
    fireEvent.pointerUp(cards[0], { pointerId: 1, clientX: 110, clientY: 300 });

    await waitFor(() => expect(saved).toEqual([["Inbox/Bbb.md", "Inbox/Aaa.md"]]));
  });

  test("a dragged FOLDER card saves the arrangement it landed in", async () => {
    // It could not be dragged at all until now (user report, 2026-08-19): the
    // drag was told to pick up note cards only, the order it saved held note
    // addresses only, and the folders never went through `arrange()`. The
    // board is one arrangement now, and a folder's address rides in the same
    // order as the notes'.
    const saved = [];
    bridge({ list_notes: [entry("Aaa")], note_folders: [noteFolder("Clientes")] });

    const { container } = render(NotesSpace, {
      props: props({ onSetOrder: (order) => saved.push(order) }),
    });
    await screen.findByText("Aaa");

    const cards = [...container.querySelectorAll(".notes-space__group, .notes-space__item")];
    expect(cards[0].classList.contains("notes-space__group")).toBe(true);
    place(cards, 220);
    fireEvent.pointerDown(cards[0], { button: 0, pointerId: 1, clientX: 110, clientY: 240 });
    fireEvent.pointerMove(cards[0], { pointerId: 1, clientX: 110, clientY: 470 });
    fireEvent.pointerUp(cards[0], { pointerId: 1, clientX: 110, clientY: 470 });

    await waitFor(() => expect(saved).toEqual([["Inbox/Aaa.md", "Clientes"]]));
  });

  test("a folder dropped on a folder is put in the order, not filed into it", async () => {
    // A folder card is where a NOTE is filed. Carrying a folder, it is no drop
    // zone at all — the app never lights up a target whose drop would do
    // nothing, and the core has no move for a folder of notes anyway.
    const saved = [];
    bridge({
      list_notes: [],
      note_folders: [noteFolder("Clientes"), noteFolder("Design")],
      move_note_to_space: "x",
    });

    const { container } = render(NotesSpace, {
      props: props({ onSetOrder: (order) => saved.push(order) }),
    });
    await screen.findByText("Clientes");

    const cards = [...container.querySelectorAll(".notes-space__group")];
    place(cards, 220);
    fireEvent.pointerDown(cards[0], { button: 0, pointerId: 1, clientX: 110, clientY: 240 });
    // Straight onto the middle of the other folder card.
    fireEvent.pointerMove(cards[0], { pointerId: 1, clientX: 110, clientY: 460 });
    fireEvent.pointerUp(cards[0], { pointerId: 1, clientX: 110, clientY: 460 });

    await waitFor(() => expect(saved).toEqual([["Design", "Clientes"]]));
    expect(invoke.mock.calls.some(([cmd]) => cmd === "move_note_to_space")).toBe(false);
  });

  test("a card dropped on a folder card is filed into it", async () => {
    // A folder card is not part of the arrangement, so it is a drop ZONE: the
    // note goes in there instead of next to it.
    bridge({
      list_notes: [entry("Aaa"), entry("Bbb")],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
      move_note_to_space: "Clientes/Aaa.md",
    });

    const { container } = render(NotesSpace, { props: props() });
    await screen.findByText("Aaa");

    const group = container.querySelector(".notes-space__group");
    const cards = [...container.querySelectorAll(".notes-space__item")];
    place(cards, 220);
    place([group], 700);
    fireEvent.pointerDown(cards[0], { button: 0, pointerId: 1, clientX: 110, clientY: 240 });
    fireEvent.pointerMove(cards[0], { pointerId: 1, clientX: 110, clientY: 720 });
    fireEvent.pointerUp(cards[0], { pointerId: 1, clientX: 110, clientY: 720 });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_note_to_space", {
        folder: "Notes",
        path: "Inbox/Aaa.md",
        toSpace: "Notes",
        toFolder: "Clientes",
      }),
    );
  });

  test("picked notes move to another space", async () => {
    bridge({
      list_notes: [entry("Ideia")],
      note_folders: [noteFolder("Inbox")],
      move_note_to_space: "Ideia.md",
    });

    render(NotesSpace, {
      props: props({ noteSpaces: [{ path: "Design/Ideias", name: "Ideias" }] }),
    });

    await userEvent.click(await screen.findByLabelText("space options"));
    await userEvent.click(await screen.findByText("Select notes…"));
    await userEvent.click(await screen.findByText("Ideia"));
    expect(screen.getByText("1 selected")).toBeTruthy();

    await userEvent.selectOptions(
      screen.getByLabelText("Move to…"),
      JSON.stringify(["Design/Ideias", "Inbox"]),
    );

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_note_to_space", {
        folder: "Notes",
        path: "Inbox/Ideia.md",
        toSpace: "Design/Ideias",
        toFolder: "Inbox",
      }),
    );
  });

  test("picked notes are deleted together", async () => {
    bridge({ list_notes: [entry("Ideia"), entry("Outra")], note_folders: [], delete_note: null });

    render(NotesSpace, { props: props() });
    await userEvent.click(await screen.findByLabelText("space options"));
    await userEvent.click(await screen.findByText("Select notes…"));
    await userEvent.click(await screen.findByText("Ideia"));
    await userEvent.click(await screen.findByText("Outra"));
    await userEvent.click(screen.getByText("Delete"));

    // Deleting twelve asks what deleting one asks (2026-08-19) — and the
    // question carries the count.
    const asked = await answerConfirm();
    expect(asked.title).toBe("Delete 2 notes?");

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_note", {
        folder: "Notes",
        path: "Inbox/Outra.md",
      }),
    );
    expect(invoke).toHaveBeenCalledWith("delete_note", {
      folder: "Notes",
      path: "Inbox/Ideia.md",
    });
  });
});

describe("NotesSpace with a note sub-function switched off", () => {
  // Notes gained the sub-functions tasks always had (App Functions,
  // 2026-08-20). Each one takes its part out of the INTERFACE and touches
  // nothing on disk — which is the half a test can actually hold onto: the
  // notes are all still listed, whatever is drawn around them.
  const source = { kind: "notes", folder: "Notes", invalidFolder: false };
  const props = (extra = {}) => ({
    source,
    readOnly: false,
    notesInbox: "Inbox",
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
    ...extra,
  });
  const off = (key) => (k) => k !== key;

  const filed = [
    { path: "Inbox/Solta.md", title: "Solta", folder: "Inbox", preview: "", pinned: false },
    {
      path: "Clientes/Guardada.md",
      title: "Guardada",
      folder: "Clientes",
      preview: "",
      pinned: false,
    },
  ];

  test("folders off: no folder card, and the notes inside are still there", async () => {
    bridge({
      list_notes: filed,
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
    });
    render(NotesSpace, { props: props({ f: off("noteFolders") }) });

    expect(await screen.findByText("Solta")).toBeTruthy();
    // The one that would have been hidden inside a folder card.
    expect(screen.getByText("Guardada")).toBeTruthy();
    expect(screen.queryByLabelText("folder options")).toBe(null);
  });

  test("folders off: the ⋮ offers neither a new folder nor the tree", async () => {
    bridge({ list_notes: [], note_folders: [] });
    render(NotesSpace, { props: props({ f: off("noteFolders") }) });

    await userEvent.click(await screen.findByLabelText("space options"));
    expect(screen.getByText("New note")).toBeTruthy();
    expect(screen.queryByText("New folder")).toBe(null);
    expect(screen.queryByText("Layout")).toBe(null);
  });

  test("pins off: no pin on a card, and none in its menu", async () => {
    bridge({ list_notes: [filed[0]], note_folders: [noteFolder("Inbox")] });
    render(NotesSpace, { props: props({ f: off("pinNotes") }) });

    expect(await screen.findByText("Solta")).toBeTruthy();
    expect(screen.queryByLabelText("Pin")).toBe(null);
    await userEvent.click(screen.getByLabelText("note options"));
    expect(screen.queryByText("Pin")).toBe(null);
    // The rest of the menu is untouched — one switch, one thing.
    expect(screen.getByText("Delete")).toBeTruthy();
  });
});

describe("NotesSpace folder management", () => {
  const source = { kind: "notes", folder: "Notes", invalidFolder: false };

  const props = (extra = {}) => ({
    source,
    readOnly: false,
    notesInbox: "Inbox",
    onChanged: noop,
    onError: noop,
    reloadKey: 0,
    ...extra,
  });

  const withFolders = (extra = {}) =>
    bridge({
      list_notes: [],
      note_folders: [noteFolder("Clientes"), noteFolder("Inbox")],
      rename_note_folder: "Contas",
      delete_note_folder: 2,
      ...extra,
    });

  /// The folder card's own ⋮ (2026-08-19). The two underlined words that used
  /// to hang under the board are gone: they only appeared once a folder was
  /// already open, which is the one moment you did not need them.
  const openFolderMenu = async () =>
    await userEvent.click(await screen.findByLabelText("folder options"));

  test("a folder card carries its own menu, on the board itself", async () => {
    withFolders();
    render(NotesSpace, { props: props() });

    await openFolderMenu();
    expect(screen.getByText("Delete")).toBeTruthy();
    expect(screen.getByText("Rename")).toBeTruthy();
    // And pinning and colouring, which a folder never had before.
    expect(screen.getByText("Pin")).toBeTruthy();
    expect(screen.getByText("colour")).toBeTruthy();
  });

  test("a folder is pinned and coloured through the space's own config", async () => {
    // A folder of notes is a plain directory: what it is coloured lives in the
    // space's `.space.json`, never in a marker inside the user's tree.
    withFolders({ set_note_folder_pinned: null, set_note_folder_color: null });
    render(NotesSpace, { props: props() });

    await openFolderMenu();
    await userEvent.click(screen.getByText("Pin"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_note_folder_pinned", {
        folder: "Notes",
        path: "Clientes",
        pinned: true,
      }),
    );

    await openFolderMenu();
    await userEvent.click(screen.getByText("colour"));
    await userEvent.click(await screen.findByText("Red"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_note_folder_color", {
        folder: "Notes",
        path: "Clientes",
        color: "4",
      }),
    );
  });

  test("renaming a folder goes through the core", async () => {
    // Naming goes through the app's own askName now (window.prompt is a no-op
    // in WebKitGTK); the widget renders without the dialog, so the pending
    // request is answered directly on the store.
    withFolders();
    const { nameRequest } = await import("../services/dialog.js");
    const { get } = await import("svelte/store");

    render(NotesSpace, { props: props() });
    await openFolderMenu();
    await userEvent.click(screen.getByText("Rename"));

    await waitFor(() => expect(get(nameRequest)).toBeTruthy());
    get(nameRequest).resolve("Contas");
    nameRequest.set(null);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("rename_note_folder", {
        folder: "Notes",
        path: "Clientes",
        name: "Contas",
      }),
    );
  });

  test("deleting a folder is confirmed and reports what moved", async () => {
    // Nothing is destroyed — the notes move up a level, and the user is told.
    const messages = [];
    withFolders();

    render(NotesSpace, {
      props: props({ onError: (e) => messages.push(e.message) }),
    });
    await openFolderMenu();
    userEvent.click(screen.getByText("Delete"));
    const asked = await answerConfirm();

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("delete_note_folder", {
        folder: "Notes",
        path: "Clientes",
      }),
    );
    // The question says what it does, and the app's own second sentence says
    // where things go — which the system dialog had no room for.
    expect(asked.title).toContain("nothing is deleted");
    expect(asked.detail).toContain("trash");
    await waitFor(() =>
      expect(messages.some((m) => m.includes("moved up one level"))).toBe(true),
    );
  });

  test("a refused confirmation deletes nothing", async () => {
    withFolders();

    render(NotesSpace, { props: props() });
    await openFolderMenu();
    userEvent.click(screen.getByText("Delete"));
    await answerConfirm(false);

    expect(invoke.mock.calls.some(([cmd]) => cmd === "delete_note_folder")).toBe(false);
  });

  test("a read-only notebook offers no folder actions", async () => {
    withFolders();
    render(NotesSpace, { props: props({ readOnly: true }) });

    // The card is drawn and opens; it simply carries no ⋮ and no pin, because
    // every item in one writes.
    expect(await screen.findByLabelText("open Clientes")).toBeTruthy();
    expect(screen.queryByLabelText("folder options")).toBeNull();
    expect(screen.queryByLabelText("Pin")).toBeNull();
  });
});
