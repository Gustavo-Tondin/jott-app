// The Settings screen: the two menu blocks, the pages, and the search on top.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { back } from "../services/back.js";
import { bridge, invoke } from "../test/bridge.js";
import { FEATURES, hasPage } from "../services/features.js";
import { answerConfirm, answerName, noop, resetScreens } from "../test/screens.js";
import SettingsView from "../screens/SettingsView.svelte";

beforeEach(resetScreens);

describe("SettingsView", () => {
  const settings = {
    dailyMode: "reset",
    weekStartsOn: "monday",
    restoreLastScreen: false,
    showListCounts: true,
    autoUrgentByDate: true,
    newTasksOnTop: false,
    dateDisplayFormat: "mm/dd/yyyy",
    closeInspectorOnClickAway: false,
    quickNoteFolder: "Inbox",
    confirmDeletes: true,
    confirmImageDownloads: true,
    accentColor: "",
    theme: "",
    mode: "",
  };

  const notebook = { path: "/n", name: "n", readOnly: false };

  const props = (extra = {}) => ({
    notebook,
    // The targets the shell computes (services/noteTargets.js): the fixed
    // space's folders, plus any user note space.
    noteTargets: [
      { space: "jott.notes", folder: "Inbox", label: "Inbox", value: "Inbox" },
      { space: "jott.notes", folder: "Clientes", label: "Clientes", value: "Clientes" },
    ],
    onChanged: noop,
    onError: noop,
    ...extra,
  });

  /// Opens one of the menu's sections (2026-08-20). The screen draws ONE at a
  /// time now, so a test that reads a setting has to say which section it
  /// lives in — which is what a person does before reading it too.
  const openSection = async (name) =>
    userEvent.click(await screen.findByRole("button", { name }));

  test("the note's own text size answers for this device", async () => {
    // It moved to the machine with the rest of Display (2026-08-20): a phone
    // held at arm's length and a monitor at a desk do not agree about it, and
    // the notebook is the same notebook.
    bridge({ notebook_settings: settings, set_machine_display: null });
    render(SettingsView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "Large" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { noteFontSize: "large" },
      }),
    );
  });

  test("the floating formatting bar's mode and side are this machine's too", async () => {
    // Display, and the section is the rule: where a bar sits over a document
    // is a fact about this screen, not about the notebook (core/settings.rs).
    bridge({ notebook_settings: settings, set_machine_display: null });
    render(SettingsView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "Floating" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { formatBar: "floating" },
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Left" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { formatBarSide: "left" },
      }),
    );
  });

  test("the search finds both rows by name, from a closed section", async () => {
    // They are markup, so `SETUP_INDEX` is the only thing that knows they
    // exist — a row missing there is invisible to the search while staying
    // perfectly reachable, which is exactly the failure worth catching here.
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props() });

    const box = await screen.findByPlaceholderText("Search settings");
    await userEvent.type(box, "formatting bar");
    // The HIT itself, not the menu entry that is on screen either way.
    expect(await screen.findByRole("button", { name: /^Formatting bar/ })).toBeTruthy();

    await userEvent.clear(box);
    await userEvent.type(box, "bar position");
    expect(await screen.findByRole("button", { name: /^Bar position/ })).toBeTruthy();
  });

  test("the Notebook section says what the notebook holds", async () => {
    // Counted by the core when the section opens (2026-08-24) — a number
    // the user can read without a file manager (principle 4).
    bridge({
      notebook_settings: settings,
      notebook_contents: { notes: 12, tasks: 1, files: 3, bytes: 2 * 1024 * 1024 },
    });
    render(SettingsView, { props: props() });
    await openSection("Notebook");
    await screen.findByText("12 notes · 1 task · 3 files · 2.0 MB");
  });

  test("Reset this section asks first, then puts the page back", async () => {
    bridge({ notebook_settings: settings, reset_settings: null, reset_machine_display: null });
    render(SettingsView, { props: props() });
    await openSection("Notebook");
    await userEvent.click(await screen.findByRole("button", { name: "Reset this section" }));
    await answerConfirm(false);
    expect(invoke).not.toHaveBeenCalledWith("reset_settings", expect.anything());

    await userEvent.click(await screen.findByRole("button", { name: "Reset this section" }));
    await answerConfirm(true);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("reset_settings", { section: "notebook" }),
    );

    // Display is this machine's drawer, and its reset goes to the other door.
    await openSection("Display");
    await userEvent.click(await screen.findByRole("button", { name: "Reset this section" }));
    await answerConfirm(true);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("reset_machine_display"));
  });

  test("a shortcut is recorded here and stored on the notebook", async () => {
    bridge({ notebook_settings: settings, set_shortcut: null });
    render(SettingsView, { props: props() });
    await openSection("Shortcuts");

    // Every command has a row, grouped by what the user is doing.
    expect(await screen.findByText("In a task list")).toBeTruthy();
    expect(screen.getByText("While writing a note")).toBeTruthy();

    const rows = screen.getAllByTitle("Record a new key");
    await userEvent.click(rows[0]);
    await fireEvent.keyDown(screen.getByText("Press a key…"), {
      key: "j",
      ctrlKey: true,
      shiftKey: true,
    });

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_shortcut", {
        id: "task.new",
        chord: "Mod+Shift+J",
      }),
    );
  });

  test("resetting forgets every binding", async () => {
    bridge({ notebook_settings: settings, reset_shortcuts: null });
    render(SettingsView, { props: props() });
    await openSection("Shortcuts");

    await userEvent.click(await screen.findByText("Reset to defaults"));
    await waitFor(() =>
      expect(invoke.mock.calls.some(([cmd]) => cmd === "reset_shortcuts")).toBe(true),
    );
  });

  test("a theme the notebook carries is offered beside the app's own", async () => {
    // The whole installation procedure is putting a file in `.jott/themes/`,
    // so the option appears by itself (2026-09-08: one <select> beside the
    // label, where the other rows keep their choice).
    bridge({ notebook_settings: settings, set_machine_display: null });
    render(SettingsView, {
      props: props({
        userThemes: [
          {
            name: "solarized",
            label: "Solarized",
            author: "Ethan",
            version: "1.2.0",
            minAppVersion: null,
            supported: true,
          },
        ],
        wornTheme: "solarized",
      }),
    });

    await openSection("Display");
    const pick = await screen.findByRole("combobox", { name: "Theme" });
    const option = [...pick.options].find((o) => o.value === "solarized");
    // What the manifest says about itself, on the option.
    expect(option.textContent).toContain("by Ethan");
    expect(option.textContent).toContain("1.2.0");

    await userEvent.selectOptions(pick, "solarized");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { theme: "solarized" },
      }),
    );
  });

  test("with no theme of its own the notebook still offers Jott, the app's palette", async () => {
    // The theme box is never empty (2026-08-26): the app's own palette is a
    // theme too — the editable `.jott/themes/jott.css` — and it is the one on
    // when nothing is chosen. Where a theme goes is behind the row's ?,
    // because that is the answer to "how do I get one".
    bridge({ notebook_settings: settings, set_machine_display: null });
    render(SettingsView, { props: props() });

    await openSection("Display");
    const pick = await screen.findByRole("combobox", { name: "Theme" });
    expect(pick.value).toBe("");
    expect(pick.selectedOptions[0].textContent).toContain("Jott");

    await userEvent.click(screen.getByRole("button", { name: "About Theme" }));
    expect(await screen.findByText(/A theme is a .css file/)).toBeTruthy();
  });

  test("choosing Jott again clears the theme, and leaves the mode alone", async () => {
    bridge({
      notebook_settings: { ...settings, theme: "solarized", mode: "dark" },
      set_machine_display: null,
    });
    render(SettingsView, {
      props: props({
        userThemes: [{ name: "solarized", label: "Solarized", supported: true }],
        wornTheme: "solarized",
      }),
    });
    await openSection("Display");
    const pick = await screen.findByRole("combobox", { name: "Theme" });
    expect(pick.value).toBe("solarized");
    await userEvent.selectOptions(pick, "");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", { display: { theme: "" } }),
    );
    // Two questions: the theme changed, the mode was not sent.
    expect(invoke).not.toHaveBeenCalledWith("set_machine_display", {
      display: expect.objectContaining({ mode: expect.anything() }),
    });
  });

  test("a theme that cannot be worn says so on its own row", async () => {
    bridge({ notebook_settings: { ...settings, theme: "future" }, set_machine_display: null });
    render(SettingsView, {
      props: props({
        userThemes: [
          {
            name: "future",
            label: "Future",
            author: null,
            version: null,
            minAppVersion: "9.0.0",
            supported: false,
          },
        ],
        // Chosen, but NOT worn: the shell is showing the default instead.
        wornTheme: null,
      }),
    });

    await openSection("Display");
    await screen.findByText(/Made for Jott 9.0.0 or newer/);
    await screen.findByText(/could not be read/);
  });

  test("what a worn theme lost on the way in is said out loud", async () => {
    bridge({ notebook_settings: { ...settings, theme: "tracked" }, set_machine_display: null });
    render(SettingsView, {
      props: props({
        userThemes: [
          {
            name: "tracked",
            label: "Tracked",
            author: null,
            version: null,
            minAppVersion: null,
            supported: true,
          },
        ],
        wornTheme: "tracked",
        // The core neutralised two addresses that pointed off the machine.
        blockedInTheme: 2,
      }),
    });

    await openSection("Display");
    await screen.findByText(/2 addresses pointing off this machine were blocked/);
  });

  test("a theme can be made out of the look on screen, worn at once, and opened", async () => {
    // The seeding happens in the shell (it is what knows which stylesheet is
    // on); this screen asks for a name, hands it over, puts the result on —
    // a theme written and not worn gives the reader no way to tell it took —
    // and opens the folder, which is where the editing happens. The door is
    // the last option of the theme box, and the box goes back to what is
    // worn: a door is not a choice.
    bridge({ notebook_settings: settings, set_machine_display: null, open_in_file_manager: null });
    const made = [];
    render(SettingsView, {
      props: props({
        onNewTheme: async (name) => {
          made.push(name);
          return { name, label: name, supported: true };
        },
      }),
    });

    await openSection("Display");
    const pick = await screen.findByRole("combobox", { name: "Theme" });
    await userEvent.selectOptions(pick, "/new");
    await answerName("Solarized");

    await waitFor(() => expect(made).toEqual(["Solarized"]));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { theme: "Solarized" },
      }),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_in_file_manager", {
        path: ".jott/themes/Solarized/theme.css",
      }),
    );
    expect(pick.value).not.toBe("/new");
  });

  test("a phone is not offered the door to a new theme", async () => {
    // Nothing there to open the folder in.
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props({ mobile: true, onNewTheme: async () => ({}) }) });
    await openSection("Display");
    const pick = await screen.findByRole("combobox", { name: "Theme" });
    expect([...pick.options].map((o) => o.value)).not.toContain("/new");
  });

  test("the mode and the accent are chosen here, and stored by name", async () => {
    // Both are a NAME, never colours (2026-08-13): the mode picks which CSS
    // file dresses the app, the accent which of the eight the brand is. Absent
    // means the one the app ships as, so the default reads as chosen without
    // the notebook having to say so.
    bridge({ notebook_settings: settings, set_machine_display: null });
    render(SettingsView, { props: props() });

    // The MODE's Jott (the segmented group), not the theme row's.
    const jott = (await screen.findAllByRole("button", { name: "Jott" })).find((b) =>
      b.className.includes("theme-segmented__item"),
    );
    expect(jott.getAttribute("aria-pressed")).toBe("true");

    // And to THIS DEVICE (2026-08-20): the phone is dark while the desktop
    // stays in Jott's own black-on-white, from one notebook.
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { mode: "dark" },
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "orange" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { accentColor: "orange" },
      }),
    );
    // Never the notebook's drawer, whatever else happened.
    expect(invoke).not.toHaveBeenCalledWith(
      "set_notebook_settings",
      expect.anything(),
    );
  });

  test("a read-only notebook still gets to dress this device", async () => {
    // The reverse of what it was until 2026-08-20, and it follows from where
    // the value goes: a notebook open for reading does not get a say in what
    // THIS screen looks like, so nothing here is disabled by it. The same
    // reasoning the update check is written under.
    bridge({ notebook_settings: settings, set_machine_display: null });
    render(SettingsView, {
      props: props({ notebook: { ...notebook, readOnly: true } }),
    });

    const dark = await screen.findByRole("button", { name: "Dark" });
    expect(dark.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "orange" }).hasAttribute("disabled")).toBe(
      false,
    );

    await userEvent.click(dark);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { mode: "dark" },
      }),
    );
  });

  test("shows every documented key with its stored value", async () => {
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props() });

    expect(await screen.findByLabelText("Date format")).toBeTruthy();
    expect(screen.getByLabelText("Show task counts in the sidebar").checked).toBe(true);
    expect(screen.getByLabelText("Reopen on the last screen").checked).toBe(false);
    expect(
      screen.getByLabelText("Close the task panel when clicking outside").checked,
    ).toBe(false);

    await openSection("Date preferences");
    expect(screen.getByLabelText("Week starts on").value).toBe("monday");
  });

  test("changing one setting sends only that key", async () => {
    // The core keeps what it is not told about, so a screen never has to
    // hold — or risk overwriting — the rest of the config. Both drawers make
    // the same pact, which is why both are exercised here.
    bridge({
      notebook_settings: settings,
      set_notebook_settings: null,
      set_machine_display: null,
    });
    render(SettingsView, { props: props() });

    await userEvent.click(
      await screen.findByLabelText("Show task counts in the sidebar"),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { showListCounts: false },
      }),
    );

    await openSection("Tasks");
    await userEvent.click(screen.getByLabelText("Treat overdue tasks as urgent"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { autoUrgentByDate: false },
      }),
    );

    // Where a new task lands is a notebook rule (2026-08-21): the select
    // speaks top/bottom, the config stores a boolean.
    await userEvent.selectOptions(screen.getByLabelText("New tasks go to"), "top");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { newTasksOnTop: true },
      }),
    );
  });

  test("the screen shows what was stored, not what it sent", async () => {
    // The core normalises: a value it cannot use falls back, and the screen
    // must show the fallback rather than the rejected input.
    let stored = { ...settings };
    bridge({
      notebook_settings: () => stored,
      set_notebook_settings: () => {
        stored = { ...stored, dateDisplayFormat: "mm/dd/yyyy" };
        return null;
      },
    });
    render(SettingsView, { props: props() });

    const field = await screen.findByLabelText("Date format");
    await userEvent.selectOptions(field, "yyyy/mm/dd");

    await waitFor(() =>
      expect(screen.getByLabelText("Date format").value).toBe("mm/dd/yyyy"),
    );
  });

  test("a read-only notebook says so and edits nothing", async () => {
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props({ notebook: { ...notebook, readOnly: true } }) });

    expect(await screen.findByText(/newer version of Jott/)).toBeTruthy();
    // What the NOTEBOOK owns is what goes dead. Display is this device's and
    // stays live — the test above says so.
    expect(screen.getByLabelText("Date format").disabled).toBe(false);

    await openSection("Date preferences");
    expect(screen.getByLabelText("Week starts on").disabled).toBe(true);

    await openSection("Tasks");
    expect(screen.getByLabelText("Treat overdue tasks as urgent").disabled).toBe(true);
  });

  test("the quick note destination offers the notes folders", async () => {
    // In Notebook since 2026-08-20: it names a folder of THIS notebook, so it
    // could not follow Display onto the machine — machine preferences are one
    // file for every notebook the app opens.
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props() });
    await openSection("Notebook");

    const field = await screen.findByLabelText("Quick note goes to");
    const options = [...field.options].map((o) => o.value);
    expect(options).toEqual(["Inbox", "Clientes"]);
  });

  test("the update check is a machine preference, written outside the notebook", async () => {
    // It answers for this INSTALL, so it goes nowhere near
    // `set_notebook_settings` and ignores a read-only notebook.
    bridge({ notebook_settings: settings, auto_update_check: true, app_version: "0.20.0" });
    render(SettingsView, { props: props({ notebook: { ...notebook, readOnly: true } }) });
    await openSection("About");

    const toggle = await screen.findByLabelText("Check for updates automatically");
    await waitFor(() => expect(toggle.checked).toBe(true));
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("remember_auto_update_check", { on: false }),
    );
    expect(invoke).not.toHaveBeenCalledWith("set_notebook_settings", expect.anything());
  });

  test("the automatic reminder and its hour are notebook rules under Remind me", async () => {
    // Both hang off the Remind me switch (2026-08-25), so the switch has to
    // be on for them to answer.
    bridge({ notebook_settings: { ...settings, autoRemind: "off", reminderTime: "09:00" } });
    render(SettingsView, {
      props: props({ notebook: { ...notebook, layout: { features: { remind: true } } } }),
    });
    await openSection("Tasks");

    await userEvent.selectOptions(
      await screen.findByLabelText("Remind me about dated tasks"),
      "dayBefore",
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { autoRemind: "dayBefore" },
      }),
    );

    const time = screen.getByLabelText("Reminder time");
    await fireEvent.input(time, { target: { value: "07:30" } });
    await fireEvent.change(time, { target: { value: "07:30" } });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { reminderTime: "07:30" },
      }),
    );
  });

  test("the tray and the session start are this install's, and not on a phone", async () => {
    bridge({
      notebook_settings: settings,
      auto_update_check: true,
      close_to_tray: true,
      autostart: false,
      app_version: "0.38.0",
    });
    render(SettingsView, { props: props() });
    await openSection("About");

    const tray = await screen.findByLabelText(
      "Keep Jott running in the tray when the window closes",
    );
    await waitFor(() => expect(tray.checked).toBe(true));
    await userEvent.click(tray);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("remember_close_to_tray", { on: false }),
    );

    await userEvent.click(screen.getByLabelText("Start Jott with the system"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_autostart", { on: true }));
    expect(invoke).not.toHaveBeenCalledWith("set_notebook_settings", expect.anything());

    await userEvent.click(screen.getByRole("button", { name: "Quit Jott" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("quit_app"));
  });

  test("a phone has no tray to offer", async () => {
    bridge({ notebook_settings: settings, auto_update_check: true, app_version: "0.38.0" });
    render(SettingsView, { props: props({ mobile: true }) });
    await openSection("About");
    await screen.findByLabelText("Check for updates automatically");
    expect(
      screen.queryByLabelText("Keep Jott running in the tray when the window closes"),
    ).toBeNull();
  });

  test("Check now asks the bridge and reports both endings", async () => {
    // An install that cannot replace itself is offered the release page.
    bridge({
      notebook_settings: settings,
      check_for_update: {
        current: "0.20.0",
        latest: "9.9.9",
        newer: true,
        canInstall: false,
        url: "https://example.com/latest",
      },
    });
    render(SettingsView, { props: props() });
    await openSection("About");

    await userEvent.click(await screen.findByRole("button", { name: "Check now" }));
    await screen.findByText("Version 9.9.9 is available.");
    await screen.findByRole("button", { name: "Download" });
  });

  test("the menu-entry row is only there for an install that has one to write", async () => {
    // A packaged Jott was put in the applications menu by its package
    // manager. Showing the switch anyway would offer a second entry for one
    // app — so the row is absent, not disabled.
    bridge({
      notebook_settings: settings,
      desktop_entry_state: { supported: false, installed: false, dismissed: false },
    });
    render(SettingsView, { props: props() });
    await openSection("About");

    // Waiting on a row that is always in About, so the absence below is
    // "the section rendered without it", not "the section had not rendered".
    await screen.findByLabelText("Check for updates automatically");
    expect(screen.queryByLabelText("Show in applications menu")).toBe(null);
  });

  test("the AppImage can put itself in the menu, and take itself back out", async () => {
    bridge({
      notebook_settings: settings,
      desktop_entry_state: { supported: true, installed: false, dismissed: false },
      set_desktop_entry: null,
    });
    render(SettingsView, { props: props() });
    await openSection("About");

    const toggle = await screen.findByLabelText("Show in applications menu");
    await waitFor(() => expect(toggle.checked).toBe(false));

    await userEvent.click(toggle);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_desktop_entry", { on: true }));
    await waitFor(() => expect(toggle.checked).toBe(true));

    // Reversible: it writes two files outside the notebook, so the same row
    // has to be able to take them away.
    await userEvent.click(toggle);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_desktop_entry", { on: false }));
  });

  test("an entry already on disk shows as on", async () => {
    bridge({
      notebook_settings: settings,
      desktop_entry_state: { supported: true, installed: true, dismissed: false },
    });
    render(SettingsView, { props: props() });
    await openSection("About");

    const toggle = await screen.findByLabelText("Show in applications menu");
    await waitFor(() => expect(toggle.checked).toBe(true));
  });

  test("the menu names every section, and one is open beside it", async () => {
    // Side by side (wireframe "Settings"): the menu never leaves and something
    // is always selected — a menu with nothing open would be half a screen.
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props() });

    // The menu is TWO blocks now (wireframe "Settings screen mobile"): how the
    // app is set up, then what it can do — with the pages of the functions
    // that are ON nested under Native Functions.
    for (const name of [
      "About",
      "Display",
      "Date preferences",
      "Notebook",
      "Shortcuts",
      "Native Functions",
      "Tasks",
      "Notes",
    ]) {
      expect(await screen.findByRole("button", { name })).toBeTruthy();
    }

    // Display leads, and only Display is drawn.
    expect(screen.getByLabelText("Date format")).toBeTruthy();
    expect(screen.queryByLabelText("Week starts on")).toBe(null);

    await openSection("Notebook");
    expect(screen.queryByLabelText("Date format")).toBe(null);
    expect(screen.getByLabelText("Clear completed after (days)")).toBeTruthy();
  });

  test("on a phone the menu is the screen, and a row goes into the section", async () => {
    // The mobile wireframe draws two screens, not two columns: the menu, and
    // the section you went into — whose name the header above carries, which
    // is why the screen reports it instead of drawing it twice.
    bridge({ notebook_settings: settings });
    const said = [];
    render(SettingsView, {
      props: props({ compact: true, onSection: (label) => said.push(label) }),
    });

    // The menu, alone: nothing of any section is on screen yet.
    expect(await screen.findByRole("button", { name: "Display" })).toBeTruthy();
    expect(screen.queryByLabelText("Date format")).toBe(null);

    await openSection("Display");
    expect(await screen.findByLabelText("Date format")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Notebook" })).toBe(null);
    expect(said.at(-1)).toBe("Display");

    // No "back" of its own (2026-09-08): the app's one gesture — the header's
    // arrow, the phone's swipe, the mouse's button — is what returns.
    expect(screen.queryByRole("button", { name: /All settings/ })).toBe(null);
    expect(back()).toBe(true);
    expect(await screen.findByRole("button", { name: "Notebook" })).toBeTruthy();
    expect(screen.queryByLabelText("Date format")).toBe(null);
    expect(said.at(-1)).toBe("");
  });

  test("below 768px a group of three or more choices is a select", async () => {
    // Three segments and a label do not share a phone's width; two do.
    bridge({ notebook_settings: settings, set_machine_display: null });
    render(SettingsView, { props: props({ compact: true }) });
    await openSection("Display");

    expect(screen.queryByRole("button", { name: "Large" })).toBe(null);
    const size = await screen.findByRole("combobox", { name: "Note text size" });
    await userEvent.selectOptions(size, "large");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { noteFontSize: "large" },
      }),
    );
    // Two choices still sit side by side.
    expect(screen.getByRole("button", { name: "Ink" })).toBeTruthy();
  });

  test("the ? beside a row opens its explanation, and does not touch the switch", async () => {
    // The prose left the page (2026-09-08): a row is its label and its
    // control, and what it means waits behind the ? — inside the row's
    // <label>, where a click must not flip the switch on the way.
    bridge({ notebook_settings: settings, set_notebook_settings: null });
    render(SettingsView, { props: props() });
    await openSection("Notebook");

    expect(screen.queryByText(/Nothing is destroyed either way/)).toBe(null);
    await userEvent.click(screen.getByRole("button", { name: "About Ask before deleting" }));
    expect(await screen.findByText(/Nothing is destroyed either way/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalledWith("set_notebook_settings", expect.anything());

    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText(/Nothing is destroyed either way/)).toBe(null),
    );
  });

  test("About reads version, system, help — and Quit last", async () => {
    bridge({ notebook_settings: settings, app_version: "0.52.1", auto_update_check: true });
    render(SettingsView, { props: props() });
    await openSection("About");
    await screen.findByText(/Jott 0\.52\.1/);

    const labels = [...document.querySelectorAll(".settings__label")].map((el) =>
      el.textContent.trim(),
    );
    const at = (name) => labels.findIndex((l) => l.startsWith(name));
    expect(at("Version")).toBeLessThan(at("Check for updates automatically"));
    expect(at("Check for updates automatically")).toBeLessThan(at("Keep Jott running"));
    expect(at("Keep Jott running")).toBeLessThan(at("Your files"));
    expect(at("Quit Jott")).toBe(labels.length - 1);
    // Check now sits on the version's own line.
    const version = screen.getByText(/Jott 0\.52\.1/).closest(".settings__row");
    expect(version.textContent).toContain("Check now");
  });

  test("the phone's back gesture returns to the menu before leaving Settings", async () => {
    // Registered while a section is open, so the shell's own handler — which
    // would walk the tab's history out of Settings — is not the one asked
    // (services/back.js).
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props({ compact: true }) });

    await openSection("Display");
    expect(await screen.findByLabelText("Date format")).toBeTruthy();

    expect(back()).toBe(true);
    expect(await screen.findByRole("button", { name: "Notebook" })).toBeTruthy();
    // And once the menu is what is on screen, back is the shell's again.
    expect(back()).toBe(false);
  });

  test("a phone is not offered the shortcuts", async () => {
    // A chord is a keyboard's, and there is none to press one on (user call,
    // 2026-08-20). The bindings themselves are untouched — they travel with
    // the notebook and answer wherever there are keys.
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props({ compact: true }) });

    expect(await screen.findByRole("button", { name: "Display" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Shortcuts" })).toBe(null);
  });

  test("the two switches that could only be turned OFF are back", async () => {
    // Both were written only by a dialog's "don't ask again", and neither was
    // ever drawn here: the user could switch them off and had no way back
    // (2026-08-20). They live with what they guard — deleting with the
    // notebook's safety, downloading with the notes' images.
    bridge({
      notebook_settings: { ...settings, confirmDeletes: false },
      set_notebook_settings: null,
    });
    render(SettingsView, { props: props() });

    await openSection("Notebook");
    const asking = await screen.findByLabelText("Ask before deleting");
    expect(asking.checked).toBe(false);
    await userEvent.click(asking);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { confirmDeletes: true },
      }),
    );

    await openSection("Notes");
    await userEvent.click(
      await screen.findByLabelText("Ask before downloading an image"),
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_notebook_settings", {
        settings: { confirmImageDownloads: false },
      }),
    );
  });

  test("the board's layout and the card's height answer for this machine", async () => {
    // Both moved to Display (user call, 2026-09-08): how a board is arranged
    // and how tall its cards are is a fact about THIS screen. A space's own
    // choice still wins over the layout; the notebook keeps the fallback.
    bridge({ notebook_settings: settings, set_machine_display: null });
    render(SettingsView, { props: props() });

    const pick = await screen.findByLabelText("Notes board layout");
    await userEvent.selectOptions(pick, "tree");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { noteLayout: "tree" },
      }),
    );
    // The grid is the app's own, so choosing it back writes the empty string
    // and the key leaves the file.
    await userEvent.selectOptions(pick, "");
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { noteLayout: "" },
      }),
    );

    // The height is a slider of LINES, and it is sent when the drag ends.
    const slider = screen.getByLabelText("Note card height");
    expect(slider.getAttribute("type")).toBe("range");
    await fireEvent.input(slider, { target: { value: "6" } });
    expect(screen.getByText("6 lines")).toBeTruthy();
    await fireEvent.change(slider, { target: { value: "6" } });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { cardLines: 6 },
      }),
    );
  });

  test("Native Functions holds the functions; a field is one page in", async () => {
    // The page that dissolved the old "App functions" dump: only the switches
    // that take a whole part of the interface with them are here, and what a
    // function HAS is on the function's own page (2026-08-20).
    bridge({ notebook_settings: settings, set_feature: null });
    render(SettingsView, { props: props() });
    await openSection("Native Functions");

    expect(await screen.findByLabelText("Tasks")).toBeTruthy();
    expect(screen.getByLabelText("Notes")).toBeTruthy();
    expect(screen.queryByLabelText("Priority")).toBe(null);
    expect(screen.queryByLabelText("Banners")).toBe(null);

    await openSection("Notes");
    expect(await screen.findByLabelText("Banners")).toBeTruthy();
    expect(screen.getByLabelText("WikiLinks [[ ]]")).toBeTruthy();
  });

  test("a function switched off takes its page out of the menu", async () => {
    // The menu is built from the switches, so nothing has to remember to
    // remove a row: a page for a part of the app that is not there would be a
    // door to an empty room.
    bridge({ notebook_settings: settings });
    render(SettingsView, {
      props: props({
        notebook: { ...notebook, layout: { features: { notes: false } } },
      }),
    });

    expect(await screen.findByRole("button", { name: "Tasks" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Notes" })).toBe(null);
    // The switch itself never leaves — it is how you turn it back on.
    await openSection("Native Functions");
    expect(await screen.findByLabelText("Notes")).toBeTruthy();
  });

  test("the search finds a row and says which page it is on", async () => {
    // ~50 rows over eight pages, and only the open page draws any of them. The
    // search answers "where is this?" with a place, and going there clears the
    // field — the question was answered.
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props() });

    const field = await screen.findByLabelText("Search settings");
    await userEvent.type(field, "trash");

    const hit = await screen.findByRole("button", { name: /Empty the trash/ });
    expect(hit.textContent).toContain("in Notebook");
    await userEvent.click(hit);

    expect(await screen.findByLabelText("Empty the trash after (days)")).toBeTruthy();
    expect(screen.getByLabelText("Search settings").value).toBe("");
  });

  test("every switch is findable by the search, with no second list to keep", async () => {
    // The criterion the index is built for (2026-08-21): a function or a
    // sub-function is findable because it is DERIVED from `features.js`, not
    // because somebody remembered to write its label out a second time. The
    // test walks the table itself, so a switch added there fails here rather
    // than going quietly missing from the search.
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props() });

    const field = await screen.findByLabelText("Search settings");
    for (const feature of FEATURES) {
      const label = feature.label();
      const parent = feature.parent
        ? FEATURES.find((f) => f.key === feature.parent)
        : null;
      // An inline group's children (the fixed spaces) live on the Native
      // Functions page itself, not behind a page of their own (2026-08-24).
      const page = parent && !parent.inline ? parent.label() : "Native Functions";
      await fireEvent.input(field, { target: { value: label } });

      // Where a hit with this exact label may land, and nowhere else. A
      // sub-function is on its function's page; a function is on Native
      // Functions, plus — when it has a page — that page, whose own NAME the
      // search counts as a row of it. Anything beyond that set is the same
      // word written out by hand as well as derived.
      const where = feature.parent
        ? [`in ${page}`]
        : [
            `in Native Functions`,
            // An inline group has children but no page of its own.
            ...(hasPage(feature.key) && !feature.inline ? [`in ${label}`] : []),
          ];

      await waitFor(() => {
        const found = screen
          .getAllByRole("button")
          .filter(
            (b) => b.querySelector(".settings__nav-label")?.textContent === label,
          )
          .map((b) => b.querySelector(".settings__hit-where")?.textContent);
        expect(found.sort(), label).toEqual([...where].sort());
      });
    }
  });

  test("the notebook's folder and the picker are reachable from here", async () => {
    // Both existed in the code and neither had a door: the folder had no menu
    // at all, and the picker was the notebook's name at the foot of a sidebar
    // that a phone keeps closed (2026-08-20).
    let switched = 0;
    bridge({ notebook_settings: settings, open_in_file_manager: null });
    render(SettingsView, { props: props({ onSwitchNotebook: () => switched++ }) });
    await openSection("Notebook");

    await userEvent.click(await screen.findByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_in_file_manager", { path: null }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Choose…" }));
    expect(switched).toBe(1);
  });

  test("the interface zoom lands when the drag ENDS, not during it", async () => {
    // The zoom is a `font-size` on the root and every measure in the app is
    // `rem`, so applying it mid-drag resizes and moves this very slider under
    // the finger — the pointer lands on another step and the value jumps again
    // (user report, 2026-08-20). The drag only moves the number.
    const asked = [];
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props({ zoom: 1, onZoom: (z) => asked.push(z) }) });

    const slider = await screen.findByLabelText("Interface zoom");
    await fireEvent.input(slider, { target: { value: "4" } });
    expect(asked).toEqual([]);
    // …and the number says what it is about to be, since nothing else moved.
    expect(screen.getByText("125%")).toBeTruthy();

    await fireEvent.change(slider, { target: { value: "4" } });
    expect(asked).toEqual([1.25]);
  });

  test("being up to date is said in one line", async () => {
    bridge({
      notebook_settings: settings,
      check_for_update: {
        current: "0.20.0",
        latest: "0.20.0",
        newer: false,
        canInstall: false,
        url: "https://example.com/latest",
      },
    });
    render(SettingsView, { props: props() });
    await openSection("About");

    await userEvent.click(await screen.findByRole("button", { name: "Check now" }));
    await screen.findByText("You have the latest version.");
  });

  test("`open` lands on a function's page, the way the task panel's card asks", async () => {
    bridge({ notebook_settings: settings });
    render(SettingsView, { props: props({ open: "fn:tasks" }) });

    // The Tasks page, not the landing: its own rows are on screen.
    await screen.findByText("Tasks screen shows");
    expect(screen.getByLabelText("New tasks go to")).toBeTruthy();
  });
});

describe("SettingsView — the three faces (2026-08-24)", () => {
  const displayProps = (extra = {}) => ({
    features: {},
    readOnly: false,
    compact: false,
    onChanged: noop,
    onError: noop,
    ...extra,
  });

  test("each picker offers the app's own face, the generics, and what the machine has", async () => {
    bridge({
      notebook_settings: { interfaceFont: "", noteFont: "", monoFont: "" },
      system_fonts: ["Fira Sans", "Noto Serif"],
      set_machine_display: null,
    });
    render(SettingsView, { props: displayProps() });
    await userEvent.click(await screen.findByRole("button", { name: "Display" }));

    const picker = await screen.findByRole("combobox", { name: "Interface font" });
    const labels = [...picker.options].map((o) => o.textContent);
    expect(labels[0]).toBe("Default (Inter)");
    expect(labels).toContain("system-ui");
    expect(labels).toContain("Fira Sans");
    // The note's default is not a face's name — it is the interface's answer.
    const note = screen.getByRole("combobox", { name: "Note font" });
    expect(note.options[0].textContent).toBe("Same as the interface");
    expect(screen.getByRole("combobox", { name: "Monospace font" }).options[0].textContent).toBe(
      "Default (DM Mono)",
    );
  });

  test("picking one writes it as a machine display choice, by family name", async () => {
    bridge({
      notebook_settings: { interfaceFont: "", noteFont: "", monoFont: "" },
      system_fonts: ["Fira Sans"],
      set_machine_display: null,
    });
    render(SettingsView, { props: displayProps() });
    await userEvent.click(await screen.findByRole("button", { name: "Display" }));

    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Note font" }),
      "Fira Sans",
    );
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("set_machine_display", {
        display: { noteFont: "Fira Sans" },
      }),
    );
  });

  test("a machine the app cannot ask says so instead of showing an empty list", async () => {
    bridge({
      notebook_settings: {},
      system_fonts: [],
      set_machine_display: null,
    });
    render(SettingsView, { props: displayProps() });
    await userEvent.click(await screen.findByRole("button", { name: "Display" }));

    expect(await screen.findByText(/only listed on Linux/)).toBeTruthy();
    // And the picker still has real choices.
    const picker = screen.getByRole("combobox", { name: "Monospace font" });
    expect([...picker.options].map((o) => o.value)).toContain("monospace");
  });

  test("the search finds the three rows", async () => {
    bridge({ notebook_settings: {}, system_fonts: [] });
    render(SettingsView, { props: displayProps() });
    await userEvent.type(await screen.findByRole("searchbox"), "font");
    const hits = await screen.findAllByRole("button", { name: /font/i });
    const labels = hits.map((h) => h.textContent);
    expect(labels.some((l) => l.includes("Interface font"))).toBe(true);
    expect(labels.some((l) => l.includes("Monospace font"))).toBe(true);
  });
});
