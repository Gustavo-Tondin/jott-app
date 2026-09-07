// The shell with tabs, and the same shell on a compact screen.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, noteFolder, resetScreens, task } from "../test/screens.js";

// The note editor's engine is stubbed by a textarea — `lib/test/screens.js`
// says why. `vi.mock` is hoisted per file, so it cannot live there.
vi.mock("../components/Editor.svelte", async () => await import("../components/EditorStub.svelte"));

const { default: App } = await import("../../App.svelte");

beforeEach(resetScreens);

describe("App shell with tabs", () => {
  const notebook = {
    path: "/n",
    name: "n",
    readOnly: false,
    lists: [
      { path: "jott.tasks/Inbox.md", name: "Inbox" },
      { path: "jott.tasks/Compras.md", name: "Compras" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
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

  const shell = (extra = {}) =>
    bridge({
      last_notebook: "/n",
      open_notebook: notebook,
      notebook_snapshot: {
        info: notebook,
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
      screen_to_restore: null,
      note_folders: [noteFolder("Inbox")],
      notes_created_today: [],
      day_tasks: [],
      grouped_suggestions: [],
      list_tasks: [],
      ...extra,
    });

  /// The tab strip's labels, in order.
  const tabLabels = () =>
    screen.getAllByRole("tab").map((el) => el.textContent.trim());

  test("opens on Home, in a tab", async () => {
    shell();
    render(App);

    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));
  });

  test("a document opens in the tab you are on, not a new one", async () => {
    // Clicking a document is like following a link: it replaces what the tab
    // shows. A new tab is a deliberate gesture.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await userEvent.click(screen.getByRole("button", { name: /^Compras/ }));
    await waitFor(() => expect(tabLabels()).toEqual(["Compras"]));
  });

  test("the plus opens a fresh tab", async () => {
    // The + is a deliberate "new tab" gesture, so it appends even when the
    // view is already open — unlike following a link, which focuses.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await userEvent.click(screen.getByLabelText("new tab"));
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Home"]));
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
  });

  test("middle click opens a document in a new tab, behind the current one", async () => {
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await fireEvent(
      screen.getByRole("button", { name: /^Compras/ }),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );

    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Compras"]));
    // The reader stays on Home (user call, 2026-09-07).
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
  });

  test("the middle button reaches Settings, the Timeline and the hamburger's rows", async () => {
    // The three doors that did not answer it (user report, 2026-09-07): the
    // gear and the path icon are buttons of the sidebar's own, and the
    // hamburger's rows are menu rows, which never carried the gesture.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));
    const middle = () => new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true });

    await fireEvent(screen.getByRole("button", { name: "Settings" }), middle());
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Settings"]));

    await fireEvent(screen.getByRole("button", { name: "Timeline" }), middle());
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Settings", "Timeline"]));

    await userEvent.click(screen.getByRole("button", { name: "menu" }));
    await fireEvent(await screen.findByText("Trash"), middle());
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Settings", "Timeline", "Trash"]));

    // All of them behind: Home is still the tab in front.
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
  });

  test("a note of the day opens in a new tab, by the middle button and by the right one", async () => {
    // The whole chain, because every link in it is where this could break: the
    // card reports the gesture (components/NoteCard.svelte), the screen names
    // the note (screens/HomeView.svelte), and only the shell opens a tab.
    const note = {
      path: "Inbox/Ideia.md",
      title: "Ideia",
      folder: "Inbox",
      preview: "",
      created: "2026-07-21",
      pinned: false,
    };
    shell({ notes_created_today: [note] });
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await fireEvent(
      await screen.findByText("Ideia"),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Ideia"]));

    // And the same door with the right button, from the Home tab again. The
    // card is asked for by its place on the board: "Ideia" now names the tab
    // as well, and a bare text query would find two.
    await userEvent.click(screen.getAllByRole("tab")[0]);
    await waitFor(() => expect(document.querySelector(".home__notes")).toBeTruthy());
    await fireEvent.contextMenu(
      within(document.querySelector(".home__notes")).getByText("Ideia"),
    );
    await userEvent.click(await screen.findByText("Open in new tab"));

    // Already open: not duplicated — and NOT focused either (user call,
    // 2026-09-07): a new tab opens behind the one being read, the browser's
    // rule for the middle button and for "Open in new tab" alike.
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Ideia"]));
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
  });

  test("the sidebar navigates the tab you are on; middle click makes a new one", async () => {
    // Same contract as documents: a click follows like a link (the back arrow
    // returns), and a fresh tab is the deliberate middle-click gesture.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));
    await waitFor(() => expect(tabLabels()).toEqual(["Tasks"]));

    expect(screen.getByLabelText("back").disabled).toBe(false);
    await userEvent.click(screen.getByLabelText("back"));
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await fireEvent(
      screen.getByRole("button", { name: "Tasks" }),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    await waitFor(() => expect(tabLabels()).toEqual(["Home", "Tasks"]));
  });

  test("the footer's notebook menu lists the recent ones and switches in place", async () => {
    // "Menu flutuante pra trocar de caderno mais rápido" (2026-09-07): the
    // name in the footer opens the list, the open one is ticked, a row makes
    // THIS window that notebook (tabs start over), and the last row is the
    // notebooks screen.
    shell({
      recent_notebooks: [
        { path: "/nb/Casa", name: "Casa", accentColor: "orange", tasks: 1, notes: 0 },
        { path: "/nb/Trabalho", name: "Trabalho", accentColor: "", tasks: 0, notes: 2 },
      ],
    });
    render(App);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    await userEvent.click(screen.getByRole("button", { name: "switch notebook" }));
    const rows = await waitFor(() => {
      const els = [...document.querySelectorAll(".menu__list .menu__link")];
      if (els.length < 3) throw new Error("menu still loading");
      return els;
    });
    expect(rows.map((el) => el.textContent.replace(/✓/g, "").trim())).toEqual([
      "Casa",
      "Trabalho",
      "Manage notebooks…",
    ]);

    await userEvent.click(rows[1]);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_notebook", expect.objectContaining({ path: "/nb/Trabalho" })),
    );
  });

  test("closing a tab lands on its neighbour, and the last one stays", async () => {
    shell();
    render(App);
    await waitFor(() => expect(tabLabels().length).toBe(1));

    await fireEvent(
      screen.getByRole("button", { name: "Tasks" }),
      new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }),
    );
    await waitFor(() => expect(tabLabels().length).toBe(2));

    await userEvent.click(screen.getAllByLabelText("close tab")[1]);
    await waitFor(() => expect(tabLabels()).toEqual(["Home"]));

    // The last tab has no close button: an app with no tab has nothing to
    // show and no way back.
    expect(screen.queryByLabelText("close tab")).toBeNull();
  });

  test("the arrows walk the active tab's own history", async () => {
    shell();
    render(App);
    await waitFor(() => expect(tabLabels().length).toBe(1));

    // Navigating inside a tab (deleting a list sends you to the Inbox) is
    // what fills its history; opening from the sidebar makes new tabs.
    expect(screen.getByLabelText("back").disabled).toBe(true);
    expect(screen.getByLabelText("forward").disabled).toBe(true);
  });

  test("the page menu offers the actions of the screen it is on", async () => {
    shell();
    render(App);
    await waitFor(() => expect(tabLabels().length).toBe(1));

    // On a list, the menu renames and deletes it.
    await userEvent.click(screen.getByRole("button", { name: /^Compras/ }));
    await userEvent.click(await screen.findByLabelText("page menu"));
    expect(await screen.findByText("rename list")).toBeTruthy();
    expect(screen.getByText("delete list")).toBeTruthy();
  });

  test("Tasks is one entry, and one screen: the Inbox", async () => {
    // Until 2026-09-04 the screen had Inbox / Today / Week inside it; the
    // day is the Home's calendar now, and the tabs went with it.
    shell();
    render(App);
    await waitFor(() => expect(tabLabels().length).toBe(1));

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));
    await waitFor(() => expect(document.querySelector(".tasks-view")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Week" })).toBeNull();
    expect(tabLabels()).toEqual(["Tasks"]);
  });
});

describe("the compact shell", () => {
  // Below 768px the top bar replaces the title bar (shell/TopBar.svelte). What
  // these guard is what that swap must NOT cost — a swap nobody here can click
  // on a phone, and which on a narrow desktop window took away the only way to
  // close the app (user report, 2026-08-18).
  const notebook = {
    path: "/n",
    name: "n",
    readOnly: false,
    features: {},
    lists: [
      { path: "jott.tasks/task-list.md", name: "Inbox" },
      { path: "jott.tasks/completed.md", name: "Completed" },
    ],
    layout: {
      inbox: "jott.tasks/task-list.md",
      completed: "jott.tasks/completed.md",
      tasksFolder: "jott.tasks",
      completedName: "completed",
      notesFolder: "jott.notes",
      notesInbox: "Inbox",
      dateDisplayFormat: "mm/dd/yyyy",
    },
  };

  const compactShell = (extra = {}) =>
    bridge({
      last_notebook: "/n",
      open_notebook: notebook,
      notebook_snapshot: {
        info: notebook,
        clock: {
          today: "2026-07-21",
          weekStart: "2026-07-20",
          nextDailyTurn: "2026-07-22T00:00:00Z",
          nextWeeklyTurn: "2026-07-27T00:00:00Z",
        },
        counts: {},
        conflicts: [],
        spaces: [],
        groups: [],
      },
      screen_to_restore: "home",
      day_tasks: [],
      grouped_suggestions: [],
      notes_created_today: [],
      window_button_layout: "appmenu:minimize,maximize,close",
      ...extra,
    });

  /// jsdom has no matchMedia at all, and shell/compact.js answers `false`
  /// without one — which is the right fallback and useless for testing the
  /// compact shell. This is the narrow window.
  const narrow = () => {
    window.matchMedia = (query) => ({
      matches: true,
      media: query,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
    });
  };

  beforeEach(narrow);

  test("a narrow desktop window keeps the buttons that close it", async () => {
    // The title bar is the ONLY handle a frameless window has, and below 768px
    // it is not rendered. Without these the app could be resized into a state
    // it cannot be closed from (user report, 2026-08-18).
    compactShell({ platform: "desktop" });

    render(App);

    expect(await screen.findByLabelText("close window")).toBeTruthy();
    expect(screen.getByLabelText("minimize")).toBeTruthy();
  });

  test("on Android there are none: the system owns the window", async () => {
    compactShell({ platform: "android" });

    render(App);

    // Waited for through something the compact bar always draws, so this is
    // not asserting on an empty screen.
    await screen.findByLabelText("open sidebar");
    expect(screen.queryByLabelText("close window")).toBeNull();
  });

  test("the tasks block keeps its own ⋮, with the twin that centres the row", async () => {
    // Both places were tried on the device (user calls, 2026-08-18). The ⋮
    // moved up to the screen's black header and came straight back: one below
    // the top bar's own ⋮, two of them stacked in the corner read as one
    // control drawn twice. It belongs on the block's row — and the invisible
    // twin opposite it is what keeps the row centred on the screen rather
    // than pushed off by the width of a menu button.
    compactShell({
      platform: "android",
      screen_to_restore: "tasks",
      list_tasks: [task("a1", "Comprar leite")],
    });

    const { container } = render(App);

    // Waited on the screen's own cards, so this is not asserting on a shell
    // that has not drawn the tasks screen yet.
    await screen.findByText("Comprar leite");
    expect(container.querySelector(".tasks-space__more")).toBeTruthy();
    expect(container.querySelector(".tasks-space__mirror")).toBeTruthy();
    // The screen's header holds the place's name and Home's +, never a block's
    // menu.
    expect(container.querySelector(".page-header--compact .page-menu__toggle")).toBeNull();
  });

  test("the task sheet has no ×: the page behind it and the handle already close it", async () => {
    // A sheet is dismissed two ways that cost no room — tapping the page it is
    // raised over, and pulling it down by its handle (BottomSheet.svelte) — so
    // an × in the toolbar only spends the corner the sun wants (user call,
    // 2026-08-18). What is left takes an end each.
    compactShell({
      platform: "android",
      screen_to_restore: "tasks",
      list_tasks: [task("a1", "Comprar leite")],
    });

    const { container } = render(App);

    await userEvent.click(await screen.findByText("Comprar leite"));

    const toolbar = await waitFor(() => {
      const el = container.querySelector(".inspector__toolbar");
      if (!el) throw new Error("no inspector");
      return el;
    });
    expect(within(toolbar).queryByLabelText("close")).toBeNull();
    expect(within(toolbar).queryByLabelText("collapse panel")).toBeNull();
    // The sun first, the gap, then the ⋮ — the two ends of the row.
    const order = [...toolbar.children].map((el) => el.className);
    expect(order[0]).toContain("inspector__myday");
    expect(order[1]).toContain("inspector__gap");
  });

  test("the desktop panel keeps the button that folds it away", async () => {
    // The other half of the same rule: a column has nowhere to be pulled down
    // to, so it still needs a control.
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
    });
    compactShell({
      platform: "desktop",
      screen_to_restore: "tasks",
      list_tasks: [task("a1", "Comprar leite")],
    });

    render(App);

    await userEvent.click(await screen.findByText("Comprar leite"));

    expect(await screen.findByLabelText("collapse panel")).toBeTruthy();
  });

  test("the header carries the colour of the place on every screen", async () => {
    // A fixed space has no colour of its own and falls back to the app's
    // accent in CSS. A mark that comes and goes says less than one that is
    // always there to be read (user call, 2026-08-18). The Home's head is
    // its header on a phone (2026-09-04) and carries the same dot.
    compactShell({ platform: "android" });

    const { container } = render(App);

    await screen.findByLabelText("open sidebar");
    await waitFor(() => {
      if (!container.querySelector(".day-head--compact .day-head__dot")) throw new Error("no dot");
    });

    await userEvent.click(screen.getByLabelText("open sidebar"));
    await userEvent.click(within(container.querySelector(".shell__sidebar")).getByText("Tasks"));
    await waitFor(() => {
      if (!container.querySelector(".page-header--compact .theme-dot")) throw new Error("no dot");
    });
  });

  test("opening the drawer hides the toggle without taking its place", async () => {
    // Two open-sidebar buttons ended up side by side (user report). The fix is
    // `visibility`, not removal: a button that leaves the row lets everything
    // after it slide left as the drawer opens.
    compactShell({ platform: "android" });

    const { container } = render(App);

    await userEvent.click(await screen.findByLabelText("open sidebar"));

    const toggle = container.querySelector(".topbar__button");
    expect(toggle.classList.contains("topbar__button--hidden")).toBe(true);
    // Still in the row, still the same square.
    expect(container.querySelectorAll(".topbar__button").length).toBeGreaterThan(0);
  });

  // ---- the note scrolls under the bar (wireframes "Editor screen", 2026-08-19) ----
  //
  // The two states the wireframes draw are one arrangement: the bar is out of
  // the flow and paints nothing, and the canvas reserves its height. At rest
  // the canvas begins where the bar ends, rounded; scrolled, the text passes
  // beneath it and the buttons are left floating on their pills.

  const withNote = (extra = {}) =>
    compactShell({
      platform: "android",
      note_folders: [noteFolder("Inbox")],
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
      ...extra,
    });

  test("an open note lifts the top bar over the page", async () => {
    withNote({ screen_to_restore: "notes" });
    const { container } = render(App);

    await userEvent.click(await screen.findByText("Ideia"));

    // The canvas carries the note's own modifier the moment the screen is one.
    await waitFor(() => expect(container.querySelector(".shell__content--note")).toBeTruthy());
    expect(container.querySelector(".topbar").classList.contains("topbar--over")).toBe(true);
  });

  test("the Home lifts it too, and every other screen keeps the bar above the canvas", async () => {
    // The Home's head is the chrome the page scrolls away under the bar
    // (wireframes "Home Screen Mobile", 2026-09-04); the note is the other
    // screen with no header of its own. Pushing the rest under the bar would
    // take their title with them.
    withNote();
    const { container } = render(App);

    await screen.findByLabelText("open sidebar");
    await waitFor(() => expect(container.querySelector(".day-head--compact")).not.toBeNull());
    expect(container.querySelector(".topbar").classList.contains("topbar--over")).toBe(true);
    // At rest the bar's buttons sit on the chrome; only a scrolled-away head
    // moves them onto the canvas (actions/stuck.js — no observer here).
    expect(container.querySelector(".topbar").getAttribute("data-region")).toBe("chrome");

    await userEvent.click(screen.getByLabelText("open sidebar"));
    await userEvent.click(within(container.querySelector(".shell__sidebar")).getByText("Notes"));
    await waitFor(() => expect(container.querySelector(".day-head--compact")).toBeNull());
    expect(container.querySelector(".topbar").classList.contains("topbar--over")).toBe(false);
  });
});
