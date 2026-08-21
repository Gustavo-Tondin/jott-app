// The app shell: opening a notebook, the sidebar, the panels, the shortcuts.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, callsTo, invoke } from "../test/bridge.js";
import { noteFolder, resetScreens, task } from "../test/screens.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

const { default: App } = await import("../../App.svelte");

beforeEach(resetScreens);

describe("App", () => {
  // The shell had no tests until three bugs in a row turned out to live here:
  // a completed list read by the wrong name, a panel that closed on every
  // save, and a click-away rule that swallowed clicks meant for a control.
  // None of them could be seen from a single screen's test.
  const notebook = {
    path: "/n",
    name: "n",
    readOnly: false,
    lists: [
      { path: "jott.tasks/Inbox.md", name: "Inbox" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
    // The on-disk addresses travel with the notebook since the snapshot
    // command; since phase 7 they are paths, not names.
    layout: {
      inbox: "jott.tasks/Inbox.md",
      completed: "jott.tasks/completed.md",
      tasksFolder: "jott.tasks",
      completedName: "completed",
      notesFolder: "jott.notes",
      notesInbox: "Inbox",
      dateDisplayFormat: "mm/dd/yyyy",
      closeInspectorOnClickAway: false,
      quickNoteFolder: "Inbox",
    },
  };

  const snapshot = (spaces = [], groups = []) => ({
    info: notebook,
    clock: {
      today: "2026-07-21",
      weekStart: "2026-07-20",
      nextDailyTurn: "2026-07-22T00:00:00Z",
      nextWeeklyTurn: "2026-07-27T00:00:00Z",
    },
    counts: {},
    conflicts: [],
    spaces,
    groups,
  });

  // `path` is the identity (2026-08-13); `folderName` rides along for anything
  // that still wants the leaf.
  const aSpace = {
    folderName: "Space",
    path: "Space",
    name: "Space",
    fixed: false,
    readOnly: false,
  };

  const shell = (extra = {}) =>
    bridge({
      last_notebook: "/n",
      open_notebook: notebook,
      // One round trip for everything the shell shows after any change.
      notebook_snapshot: snapshot(),
      screen_to_restore: "list:jott.tasks/task-list.md",
      note_folders: [noteFolder("Inbox")],
      notes_created_today: [],
      list_tasks: [task("a1", "Comprar leite"), task("b2", "Pagar boleto")],
      period_tasks: [],
      grouped_suggestions: [],
      set_task_fields: null,
      ...extra,
    });

  const openTask = async (text) => {
    await userEvent.click(await screen.findByText(text));
    return await screen.findByLabelText("task name");
  };

  // The cases below only ever happen on Android, where no one developing Jott
  // can click. The tests are the only thing standing between a working first
  // launch there and a screen the user cannot get past.
  //
  // What the platform offers CHANGED on 2026-08-19. Android used to open the
  // app's own container silently, because there was nothing else to open: no
  // folder picker, and a Storage Access Framework URI the core cannot read.
  // That container turned out to be unreachable to every other app — including
  // the sync client the whole arrangement was for — so the app now asks for
  // file access and browses real folders, and the container is one of two
  // choices on the onboarding screen rather than a silent default.
  test("with no notebook to reopen, it offers the folder the platform gives it", async () => {
    const opened = vi.fn(() => notebook);
    const container =
      "/storage/emulated/0/Android/data/dev.gustavotondin.jott/files/Documents/Jott";
    shell({
      last_notebook: null,
      default_notebook_folder: container,
      open_notebook: opened,
      // What the bridge really answers with nothing open — and what keeps the
      // app on the onboarding screen instead of drawing a notebook it has not
      // got.
      notebook_snapshot: () => Promise.reject(new Error("no notebook is open")),
    });

    render(App);

    // Offered, not taken: opening it silently is what hid the fact that
    // nothing else on the phone can read it.
    await screen.findByText("Use Jott's private folder instead");
    expect(opened).not.toHaveBeenCalled();

    // The onboarding buttons are disabled while the boot is still asking the
    // bridge what there is to open; the node is re-queried each time because
    // the block it lives in is created by that same answer.
    const button = () => screen.getByText("Use Jott's private folder instead");
    await waitFor(() => expect(button().disabled).toBe(false));
    await userEvent.click(button());
    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(opened.mock.calls[0][0]).toEqual({ path: container });
  });

  test("where the platform offers no folder, it only asks the user for one", async () => {
    const opened = vi.fn(() => notebook);
    // Desktop: `default_notebook_folder` answers null, because choosing where
    // the notebook lives is the user's call and the system has a picker.
    shell({
      last_notebook: null,
      default_notebook_folder: null,
      open_notebook: opened,
      notebook_snapshot: () => Promise.reject(new Error("no notebook is open")),
    });

    render(App);

    await waitFor(() => expect(screen.getByText("Choose notebook folder…")).toBeTruthy());
    expect(screen.queryByText("Use Jott's private folder instead")).toBeNull();
    expect(opened).not.toHaveBeenCalled();
  });

  test("on Android the button asks for file access first, and browses after", async () => {
    // The two halves of the same button. Android has no system folder picker
    // to open (`pick_notebook_folder` answers null there), and cannot browse
    // anything at all until the user has granted file access on a Settings
    // screen the app can only send them to.
    const picked = vi.fn();
    const request = vi.fn();
    window.JottAndroid = { granted: () => false, request };
    shell({
      last_notebook: null,
      default_notebook_folder: "/storage/emulated/0/Android/data/x/files/Documents/Jott",
      pick_notebook_folder: picked,
      notebook_snapshot: () => Promise.reject(new Error("no notebook is open")),
      list_folders: {
        path: "/storage/emulated/0",
        name: "0",
        parent: null,
        folders: [{ path: "/storage/emulated/0/Docs", name: "Docs", notebook: false }],
      },
    });

    render(App);

    const button = () => screen.getByText("Allow file access");
    await waitFor(() => expect(button().disabled).toBe(false));
    await userEvent.click(button());
    expect(request).toHaveBeenCalledOnce();
    // Never the system picker: there is none on this platform, and calling it
    // would fail silently.
    expect(picked).not.toHaveBeenCalled();

    // Granted, and back from Settings — which is the only signal there is.
    window.JottAndroid = { granted: () => true, request };
    document.dispatchEvent(new CustomEvent("android-storage-changed"));

    await userEvent.click(await screen.findByText("Choose notebook folder…"));
    await screen.findByText("Docs");
    expect(picked).not.toHaveBeenCalled();

    delete window.JottAndroid;
  });

  test("a remembered notebook is reopened, whatever the platform offers", async () => {
    // The revision above must not disturb anyone already using the app: an
    // Android install from before it keeps opening the container it has.
    const opened = vi.fn(() => notebook);
    shell({
      last_notebook: "/storage/emulated/0/Android/data/dev.gustavotondin.jott/files/Documents/Jott",
      default_notebook_folder:
        "/storage/emulated/0/Android/data/dev.gustavotondin.jott/files/Documents/Jott",
      open_notebook: opened,
    });

    render(App);

    await waitFor(() => expect(opened).toHaveBeenCalled());
    expect(screen.queryByText("Choose notebook folder…")).toBeNull();
  });

  test("the sidebar counts the open tasks of a place, not only of a list", async () => {
    // It only ever counted a user's own lists (user report, 2026-08-20): the
    // fixed Tasks row and every tasks space had no number at all, so a
    // notebook without hand-made lists showed the counter nowhere and the
    // setting looked broken. A space is several lists, so the row adds them up.
    shell({
      notebook_snapshot: {
        ...snapshot([{ ...aSpace, kind: "tasks" }]),
        counts: {
          "jott.tasks/Inbox.md": 2,
          "jott.tasks/Compras.md": 1,
          "Space/Inbox.md": 4,
        },
      },
    });
    render(App);

    const tasks = await screen.findByRole("button", { name: /^Tasks/ });
    expect(within(tasks).getByText("3")).toBeTruthy();

    const space = screen.getByRole("button", { name: /^Space/ });
    expect(within(space).getByText("4")).toBeTruthy();
  });

  test("with the counter switched off the bridge answers empty, and no row shows one", async () => {
    // `commands::counts_of` returns `{}` rather than nothing, so the shell has
    // no preference to read: there is simply nothing to draw.
    shell({ notebook_snapshot: { ...snapshot([{ ...aSpace, kind: "tasks" }]), counts: {} } });
    render(App);

    const tasks = await screen.findByRole("button", { name: /^Tasks/ });
    expect(tasks.querySelector(".shell__count")).toBe(null);
  });

  test("opening a note clears the right panel and takes it for the formatting", async () => {
    // User call, 2026-08-19: "ao entrar num editor de notas, se tem uma tarefa
    // aberta, ela deve fechar imediatamente". An inspector left standing over
    // a note describes something that is not on screen any more.
    shell({
      list_notes: [
        {
          path: "Inbox/Ideia.md",
          title: "Ideia",
          folder: "Inbox",
          preview: "preview",
          created: "2026-07-21",
          pinned: false,
        },
      ],
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: "2026-07-21",
      },
      write_note: null,
    });
    render(App);

    await openTask("Comprar leite");
    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await userEvent.click(await screen.findByText("Ideia"));

    await waitFor(() => expect(screen.queryByLabelText("task name")).toBeNull());
    expect(screen.getByLabelText("Formatting")).toBeTruthy();
  });

  test("the place a note was opened from stays marked in the sidebar", async () => {
    // Roadmap Etapa 7 (2026-08-21): a note open from Notes is INSIDE Notes,
    // and the sidebar used to go dark the moment the board gave way to the
    // editor. The row is marked as holding, not as open — one pill at a time.
    shell({
      list_notes: [
        {
          path: "Inbox/Ideia.md",
          title: "Ideia",
          folder: "Inbox",
          preview: "preview",
          created: "2026-07-21",
          pinned: false,
        },
      ],
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: "2026-07-21",
      },
      write_note: null,
    });
    render(App);

    const notes = await screen.findByRole("button", { name: "Notes" });
    await userEvent.click(notes);
    expect(notes.classList.contains("shell__nav-item--active")).toBe(true);
    expect(notes.classList.contains("shell__nav-item--holds")).toBe(false);

    await userEvent.click(await screen.findByText("Ideia"));
    await waitFor(() => expect(notes.classList.contains("shell__nav-item--holds")).toBe(true));
    expect(notes.classList.contains("shell__nav-item--active")).toBe(false);
    // Home holds nothing: a screen outside every space never lights a row.
    expect(
      screen.getByRole("button", { name: "Home" }).classList.contains("shell__nav-item--holds"),
    ).toBe(false);
  });

  test("the note's panel has the head and the foot every panel has", async () => {
    // User report, 2026-08-19: the formatting controls were the whole panel,
    // while the wireframe draws the same silhouette the inspector has — a way
    // to fold it away and a ⋮ above, where the note lives and a trash below.
    shell({
      list_notes: [
        {
          path: "Inbox/Ideia.md",
          title: "Ideia",
          folder: "Inbox",
          preview: "preview",
          created: "2026-07-21",
          pinned: false,
        },
      ],
      note_folders: [noteFolder("Inbox"), noteFolder("Clientes")],
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: "2026-07-21",
      },
      write_note: null,
      move_note_to_space: "Clientes/Ideia.md",
    });
    render(App);

    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await userEvent.click(await screen.findByText("Ideia"));
    await screen.findByLabelText("Formatting");

    expect(screen.getByLabelText("collapse panel")).toBeTruthy();
    expect(screen.getByLabelText("note options")).toBeTruthy();

    // The foot says where the note is filed, and is the way to move it.
    await userEvent.click(screen.getByLabelText("Move to…"));
    await userEvent.click(await screen.findByText("Clientes"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_note_to_space", {
        folder: "jott.notes",
        path: "Inbox/Ideia.md",
        toSpace: "jott.notes",
        toFolder: "Clientes",
      }),
    );
  });

  test("the text size picked from the note's menu is written to the machine", async () => {
    // Display is this machine's (2026-08-20): the same choice in Settings goes
    // to `set_machine_display`, and this menu wrote it to the notebook instead
    // — the phone's pick would have travelled to the desktop.
    shell({
      list_notes: [
        {
          path: "Inbox/Ideia.md",
          title: "Ideia",
          folder: "Inbox",
          preview: "preview",
          created: "2026-07-21",
          pinned: false,
        },
      ],
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: "2026-07-21",
      },
      write_note: null,
      set_machine_display: null,
    });
    render(App);

    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await userEvent.click(await screen.findByText("Ideia"));
    await userEvent.click(await screen.findByLabelText("note options"));
    await userEvent.click(await screen.findByText("Text size"));
    await userEvent.click(await screen.findByText("Large"));

    await waitFor(() =>
      expect(callsTo("set_machine_display")).toEqual([{ display: { noteFontSize: "large" } }]),
    );
    expect(callsTo("set_notebook_settings")).toEqual([]);
  });

  // ---- the way back to the docked panel (user call, 2026-08-19) ----
  //
  // Sending the controls to float was one click on the panel's ×; bringing
  // them back was two, inside a submenu of the page ⋮ — and nothing on screen
  // said the panel was still there to reopen.
  test("closing the formatting panel leaves a button that reopens it", async () => {
    shell({
      list_notes: [
        {
          path: "Inbox/Ideia.md",
          title: "Ideia",
          folder: "Inbox",
          preview: "preview",
          created: "2026-07-21",
          pinned: false,
        },
      ],
      note_folders: [noteFolder("Inbox")],
      read_note: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        body: "Corpo.",
        pinned: false,
        created: "2026-07-21",
      },
      write_note: null,
    });
    const { container } = render(App);

    await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
    await userEvent.click(await screen.findByText("Ideia"));
    await screen.findByLabelText("Formatting");

    // Docked: the bar is the panel, and there is nothing to reopen.
    expect(screen.queryByLabelText("Dock the formatting panel")).toBeNull();

    await userEvent.click(screen.getByLabelText("collapse panel"));

    // Floating now — and the way back is on screen, in a pill of its own.
    const dock = await screen.findByLabelText("Dock the formatting panel");
    const pill = container.querySelector(".format-float--dock");
    expect(pill).toBeTruthy();
    // Its own box, not a tenth button inside the bar: it formats nothing.
    expect(dock.closest(".format-bar")).toBeNull();
    // BESIDE the bar, in the row the two travel in (user call, 2026-08-19).
    // Placed on its own it landed in the corner the page ⋮ already owns.
    expect(pill.parentElement.classList.contains("format-floats")).toBe(true);
    expect(pill.previousElementSibling.querySelector(".format-bar")).toBeTruthy();
    // And the row hangs off the canvas, which begins below the page header —
    // measured from the panel, the bar sat on the header itself.
    expect(pill.closest(".shell__canvas")).toBeTruthy();
    expect(pill.closest(".page-header")).toBeNull();

    await userEvent.click(dock);

    // Back in the panel, and the button has nothing left to offer.
    await screen.findByLabelText("collapse panel");
    expect(screen.queryByLabelText("Dock the formatting panel")).toBeNull();
  });

  test("the sidebar head carries search and a + that makes things", async () => {
    // Both were only reachable by shortcut or by right-clicking empty column
    // — which stops existing as soon as the column is full (user call,
    // 2026-08-17).
    shell();
    render(App);
    await screen.findByText("Comprar leite");

    await userEvent.click(screen.getByLabelText("new list, notepad or group"));
    // Inside the dropdown: an empty column also offers its own two buttons,
    // and both say the same words.
    const made = within(document.querySelector(".menu__list"));
    expect(made.getByText("New list")).toBeTruthy();
    expect(made.getByText("New notepad")).toBeTruthy();
    expect(made.getByText("New group")).toBeTruthy();

    await userEvent.click(screen.getByLabelText("search"));
    // The whole notebook, the same box Ctrl+F opens.
    expect(await screen.findByPlaceholderText("Search tasks and notes…")).toBeTruthy();
  });

  test("the sidebar reopens as wide as it was left", async () => {
    // A machine preference, not a notebook one: it answers to a monitor.
    shell({ sidebar_width: 300 });
    render(App);
    await screen.findByText("Comprar leite");

    await waitFor(() =>
      expect(document.querySelector(".window").getAttribute("style")).toContain(
        "--theme-sidebar-left: 300px",
      ),
    );

    // And the edge between the panels is a handle that says how wide it is.
    const handle = screen.getByLabelText("resize sidebar");
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
  });

  test("the right panel is resizable too, and keeps its own width", async () => {
    shell({
      panel_width: 320,
      period_tasks: [],
      grouped_suggestions: [],
    });
    render(App);
    await screen.findByText("Comprar leite");

    await waitFor(() =>
      expect(document.querySelector(".window").getAttribute("style")).toContain(
        "--theme-sidebar-right: 320px",
      ),
    );
    // The handle exists only while a panel does.
    expect(screen.queryByLabelText("resize panel")).toBeNull();
    await userEvent.click(await screen.findByText("Comprar leite"));
    expect(await screen.findByLabelText("resize panel")).toBeTruthy();
  });

  test("the two handles answer the arrow keys in opposite directions", async () => {
    // One gesture, mirrored (shell/PanelResizer.svelte): the right panel's
    // handle sits on the side its width grows AWAY from, so the same key that
    // narrows the sidebar widens the panel. A separator that can be moved has
    // to be operable from the keyboard, or the width is mouse-only.
    shell({ sidebar_width: 300, panel_width: 320, remember_panel_width: null });
    render(App);
    await screen.findByText("Comprar leite");
    await userEvent.click(await screen.findByText("Comprar leite"));

    const sidebar = await screen.findByLabelText("resize sidebar");
    sidebar.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(sidebar.getAttribute("aria-valuenow")).toBe("292");

    const panel = await screen.findByLabelText("resize panel");
    panel.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(panel.getAttribute("aria-valuenow")).toBe("328");
  });

  test("an absurd stored width is clamped instead of taking over the window", async () => {
    shell({ sidebar_width: 9000 });
    render(App);
    await screen.findByText("Comprar leite");

    await waitFor(() =>
      expect(document.querySelector(".window").getAttribute("style")).toContain(
        "--theme-sidebar-left: 480px",
      ),
    );
  });

  test("Completed lives in the right-rail menu, not among the lists", async () => {
    // It is created by the app on every open, so it never sits among the user's
    // lists; it moved to the hamburger's lesser pages.
    shell();
    render(App);

    await screen.findByText("Comprar leite");
    // Not shown in the sidebar at all.
    expect(screen.queryByText("Completed")).toBeNull();

    // But one click from the right-rail hamburger.
    await userEvent.click(screen.getByLabelText("menu"));
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("Tags management")).toBeTruthy();
    expect(screen.getByText("Trash")).toBeTruthy();
  });

  test("Ctrl+T opens the new task popup from any screen", async () => {
    // The app is a capture tool: reaching for the mouse to write down the
    // thing you just thought of is the cost it exists to remove.
    shell();
    render(App);

    await screen.findByText("Comprar leite");
    await userEvent.keyboard("{Control>}t{/Control}");

    // The popup composes an intent; writing it is `composeTask`'s job.
    const field = await screen.findByPlaceholderText("Create a task…");
    await userEvent.type(field, "Ligar para o cliente{Enter}");

    await waitFor(() =>
      expect(
        invoke.mock.calls.some(
          ([cmd, args]) => cmd === "create_task" && args.text === "Ligar para o cliente",
        ),
      ).toBe(true),
    );
    // And it closes itself, so the next screen is not behind a dialog.
    await waitFor(() => expect(screen.queryByPlaceholderText("Create a task…")).toBeNull());
  });

  test("Ctrl+F searches the whole notebook and opens what was picked", async () => {
    shell({
      search: {
        tasks: [
          {
            kind: "task",
            path: "jott.tasks/Compras.md",
            folder: "",
            id: "a1",
            title: "Comprar cimento",
            snippet: "",
            space: "Tasks",
            container: "Compras",
            done: false,
          },
        ],
        notes: [],
        truncated: false,
      },
    });
    render(App);

    await screen.findByText("Comprar leite");
    await userEvent.keyboard("{Control>}f{/Control}");
    await userEvent.type(await screen.findByPlaceholderText("Search tasks and notes…"), "cimento");

    // The core decides what matches; the dialog only asks and draws.
    await waitFor(() =>
      expect(
        invoke.mock.calls.some(([cmd, args]) => cmd === "search" && args.query === "cimento"),
      ).toBe(true),
    );

    // Picking a hit goes there and closes the dialog.
    await userEvent.click(await screen.findByText("Comprar cimento"));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Search tasks and notes…")).toBeNull(),
    );
    expect(invoke).toHaveBeenCalledWith("list_tasks", { list: "jott.tasks/Compras.md" });
    // And the TASK opens, not just the list it happens to live in.
    expect(await screen.findByLabelText("task name")).toBeTruthy();
  });

  test("Ctrl+N asks for a note title and opens what it created", async () => {
    shell({ create_note: "Inbox/Ideia.md" });
    render(App);

    await screen.findByText("Comprar leite");
    await userEvent.keyboard("{Control>}n{/Control}");

    await userEvent.type(await screen.findByDisplayValue("New note"), "Ideia");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "create_note")).toBe(true),
    );
  });

  test("saving a task leaves the inspector open", async () => {
    // Saving refreshes the notebook, and the effect that closes the panel on
    // navigation used to depend on it. Editing the date closed the panel
    // between choosing the month and choosing the day.
    shell();
    render(App);

    await openTask("Comprar leite");
    // Make an edit through the tag picker (its create flow adds a tag).
    await userEvent.click(screen.getByRole("button", { name: "add tag" }));
    await userEvent.type(screen.getByPlaceholderText("New tag name"), "casa{enter}");

    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "set_task_fields")).toBe(true),
    );
    expect(screen.queryByLabelText("task name")).not.toBeNull();
  });

  test("an opened task is highlighted even with no id yet", async () => {
    // The lazy id: a task written by hand (or freshly respawned) has no id
    // until it is edited. Highlighting by id alone left it unhighlighted when
    // opened — only already-addressed tasks lit up. It must match by identity.
    shell({ list_tasks: [task(null, "Sem id ainda")] });
    const { container } = render(App);

    await userEvent.click(await screen.findByText("Sem id ainda"));

    await waitFor(() =>
      expect(container.querySelector(".task-row--selected")).toBeTruthy(),
    );
  });

  test("clicking another task swaps the panel instead of closing it", async () => {
    shell();
    render(App);

    await openTask("Comprar leite");
    expect(screen.getByLabelText("task name").value).toBe("Comprar leite");

    await userEvent.click(screen.getByText("Pagar boleto"));

    await waitFor(() =>
      expect(screen.getByLabelText("task name").value).toBe("Pagar boleto"),
    );
  });

  test("clicking away does not close the panel", async () => {
    // Tried and removed: even scoped to the empty space it fired too easily,
    // and losing a half-typed task costs more than the shortcut is worth.
    // Kept as a test so it does not come back by accident.
    shell();
    const { container } = render(App);

    await openTask("Comprar leite");

    await userEvent.click(screen.getByPlaceholderText("New task…"));
    await fireEvent.click(container.querySelector(".shell__content"));

    expect(screen.queryByLabelText("task name")).not.toBeNull();
  });

  test("escape closes the panel, but first only the open calendar", async () => {
    // The date picker catches Escape while its calendar is open (to dismiss
    // just the calendar); only once nothing else is open does Escape close the
    // whole panel.
    shell();
    render(App);

    await openTask("Comprar leite");

    // Calendar open: Escape dismisses it and the panel stays.
    await userEvent.click(screen.getByLabelText("Due date"));
    await fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByLabelText("task name")).not.toBeNull();

    // Calendar closed: Escape now closes the panel.
    await fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("task name")).toBeNull());
  });

  test("changing screen keeps the panel open", async () => {
    // The inspector persists across screens now (user request 2026-07-23): a
    // task opened on one screen keeps showing while you look elsewhere.
    shell();
    render(App);

    await openTask("Comprar leite");
    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));

    await waitFor(() => expect(screen.getByLabelText("task name")).toBeTruthy());
  });

  test("the sidebar collapses to an icon rail and back", async () => {
    shell();
    const { container } = render(App);

    await screen.findByText("Comprar leite");
    const sidebar = container.querySelector(".shell__sidebar");
    expect(sidebar.classList.contains("shell__sidebar--rail")).toBe(false);

    await userEvent.click(screen.getByLabelText("collapse sidebar"));
    expect(sidebar.classList.contains("shell__sidebar--rail")).toBe(true);

    // The button now offers the reverse action.
    await userEvent.click(screen.getByLabelText("expand sidebar"));
    expect(sidebar.classList.contains("shell__sidebar--rail")).toBe(false);
  });

  test("dragging a sidebar list saves the new order", async () => {
    const withLists = {
      ...notebook,
      lists: [
        { path: "jott.tasks/Inbox.md", name: "Inbox" },
        { path: "jott.tasks/completed.md", name: "Completed" },
        { path: "jott.tasks/Alpha.md", name: "Alpha" },
        { path: "jott.tasks/Beta.md", name: "Beta" },
      ],
    };
    bridge({
      last_notebook: "/n",
      open_notebook: withLists,
      notebook_snapshot: {
        info: withLists,
        clock: {
          today: "2026-07-21",
          weekStart: "2026-07-20",
          nextDailyTurn: "2026-07-22T00:00:00Z",
          nextWeeklyTurn: "2026-07-27T00:00:00Z",
        },
        counts: {},
        conflicts: [],
        spaces: [],
      },
      screen_to_restore: "list:jott.tasks/task-list.md",
      note_folders: [noteFolder("Inbox")],
      notes_created_today: [],
      list_tasks: [],
      period_tasks: [],
      grouped_suggestions: [],
      set_order: null,
    });
    const { container } = render(App);

    await screen.findByText("Alpha");
    const items = container.querySelectorAll(".shell__nav-item--reorderable");
    expect(items.length).toBe(2);
    // jsdom has no layout: stack the two 40px rows top to bottom.
    items.forEach((el, i) => {
      el.getBoundingClientRect = () => ({
        left: 0, right: 200, width: 200,
        top: i * 40, bottom: i * 40 + 40, height: 40,
        x: 0, y: i * 40, toJSON() {},
      });
    });

    // Drag Alpha (row 0) below Beta's midpoint (60): it should land after Beta.
    await fireEvent.pointerDown(items[0], { button: 0, pointerId: 1, clientY: 5 });
    await fireEvent.pointerMove(items[0], { pointerId: 1, clientY: 75 });
    await fireEvent.pointerUp(items[0], { pointerId: 1, clientY: 75 });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_order", {
        namespace: "lists:jott.tasks",
        names: ["Beta", "Alpha"],
      }),
    );
  });

  test("the sidebar's right-click menu also sorts the spaces", async () => {
    shell({ spaces_sort: "", set_spaces_sort: null });
    render(App);
    await screen.findByText("Comprar leite");

    await fireEvent.contextMenu(document.querySelector(".shell__sidebar-scroll"));
    await userEvent.click(await screen.findByText("Sort"));
    await userEvent.click(await screen.findByText("Sort by name"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_spaces_sort", { sort: "name" }),
    );
  });

  test("an empty column offers both kinds by name", async () => {
    // Nothing to right-click is nothing to discover, so the first entries keep
    // their buttons (user call, 2026-08-06) — and each says what it makes: one
    // button that quietly made a task list was the bug of 2026-08-11.
    shell();
    render(App);
    await screen.findByText("Comprar leite");
    expect(screen.getByRole("button", { name: "New list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New notepad" })).toBeTruthy();
  });

  test("once there is one, only the menu makes them", async () => {
    // Permanent buttons at the bottom of the list read as two more entries.
    shell({ notebook_snapshot: snapshot([aSpace]) });
    render(App);
    await screen.findByText("Space");
    expect(screen.queryByRole("button", { name: "New list" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New notepad" })).toBeNull();
  });

  test("a group inside a group is drawn inside it, and opens its members", async () => {
    // Groups nest (user call, 2026-08-11), so the column is a tree that
    // renders itself. What this guards is the recursion: an entry two levels
    // down has to appear at all, and clicking it has to open it.
    const inner = {
      folderName: "Acme",
      path: "Design/Clients/Acme",
      name: "Acme",
      kind: "tasks",
      known: true,
      fixed: false,
      readOnly: false,
      sort: null,
      order: [],
    };
    shell({
      notebook_snapshot: snapshot(
        [inner],
        [
          { folder: "Design", parent: null, name: "Design", spaces: [] },
          {
            folder: "Design/Clients",
            parent: "Design",
            name: "Clients",
            spaces: ["Design/Clients/Acme"],
          },
        ],
      ),
    });
    render(App);

    await screen.findByText("Design");
    expect(screen.getByText("Clients")).toBeTruthy();
    // The space is drawn inside the innermost level, not loose at the top.
    const nested = document.querySelectorAll(".shell__spaces--nested");
    expect(nested.length).toBe(2);
    expect(within(nested[1]).getByText("Acme")).toBeTruthy();

    // And it opens: the space's own screen names it, so "Acme" is on the
    // page twice — once in the column, once as the title.
    await userEvent.click(within(nested[1]).getByText("Acme"));
    await waitFor(() => expect(screen.getAllByText("Acme").length).toBeGreaterThan(1));
  });

  test("creating a list from the sidebar's right-click menu", async () => {
    // window.prompt is broken in WebKitGTK, so naming goes through the app's
    // own NameDialog (reestruturação 2026-07-30). Creating itself lives in the
    // right-click menu since 2026-08-06 — a permanent button at the bottom of
    // the list read as one more entry. The menu names the two kinds outright
    // (user call, 2026-08-11): a list, or a notepad.
    shell({ create_space_in: "My Project", notebook_snapshot: snapshot([aSpace]) });
    render(App);
    await screen.findByText("Comprar leite");

    await fireEvent.contextMenu(document.querySelector(".shell__sidebar-scroll"));
    expect(await screen.findByText("New notepad")).toBeTruthy();
    await userEvent.click(await screen.findByText("New list"));

    // The dialog appears; type the name and confirm (scoped to the dialog, as
    // the shell has other text inputs on screen).
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByRole("textbox"), "My Project");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    // One door for both cases: at the root the group is simply null.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("create_space_in", {
        name: "My Project",
        kind: "tasks",
        group: null,
      }),
    );
  });
});
