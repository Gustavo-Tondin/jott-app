// The notebooks screen — the door of the app.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { answerConfirm, noop, resetScreens } from "../test/screens.js";
import NotebooksView from "../screens/NotebooksView.svelte";

beforeEach(resetScreens);

describe("NotebooksView", () => {
  const entry = (name, extra = {}) => ({
    path: `/home/tonda/${name}`,
    name,
    accentColor: "blue",
    notes: 12,
    tasks: 7,
    readOnly: false,
    // Far enough back to be stable whatever second the test runs in.
    opened: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    ...extra,
  });
  const props = (extra = {}) => ({
    version: "0.25.0",
    onChoose: noop,
    onOpen: noop,
    onPickFolder: noop,
    onError: noop,
    ...extra,
  });

  /// Whether a menu row is ticked. `MenuItems.svelte` draws a choice group as
  /// a `✓` in a fixed-width slot — an empty slot for the unticked rows, so the
  /// labels stay aligned — and that mark IS the state to a reader.
  const ticked = (label) => {
    const row = screen
      .getAllByRole("button")
      .find((b) => b.textContent.includes(label));
    expect(row, `no menu row for ${label}`).toBeTruthy();
    return row.querySelector(".menu__check")?.textContent === "✓";
  };

  test("with nothing remembered it is the two doors and no list", async () => {
    bridge({ recent_notebooks: [] });
    render(NotebooksView, { props: props() });

    expect(await screen.findByText("Create a new notebook")).toBeTruthy();
    expect(screen.getByText("Open a notebook")).toBeTruthy();
    // No panel around an empty list — the empty wireframe has none.
    expect(screen.queryByText("Pick a notebook")).toBeNull();
    expect(screen.getByText("0.25.0")).toBeTruthy();
  });

  test("a card carries the name, the two counts and when it was last opened", async () => {
    bridge({ recent_notebooks: [entry("Work Notebook")] });
    render(NotebooksView, { props: props() });

    expect(await screen.findByText("Work Notebook")).toBeTruthy();
    expect(screen.getByText("12 notes · 7 tasks")).toBeTruthy();
    expect(screen.getByText("42 min ago")).toBeTruthy();
  });

  test("the counts are singular where there is one of a thing", async () => {
    bridge({ recent_notebooks: [entry("Solo", { notes: 1, tasks: 1 })] });
    render(NotebooksView, { props: props() });
    expect(await screen.findByText("1 note · 1 task")).toBeTruthy();
  });

  test("the phone drops the time beside the name", async () => {
    // Not a smaller font: there is no room for it next to a title on a phone,
    // and the mobile wireframe does not draw it at all.
    bridge({ recent_notebooks: [entry("Work Notebook")] });
    render(NotebooksView, { props: props({ compact: true }) });

    expect(await screen.findByText("Work Notebook")).toBeTruthy();
    expect(screen.queryByText("42 min ago")).toBeNull();
    // The counts are the half that survives.
    expect(screen.getByText("12 notes · 7 tasks")).toBeTruthy();
  });

  test("the card wears the colour chosen inside that notebook", async () => {
    // A NAME on the wire, a `var()` on the element — never a hex, which is the
    // whole covenant of services/accent.js. The solid rung, because a card
    // carries text (styles/roles.css).
    bridge({ recent_notebooks: [entry("Work", { accentColor: "orange" })] });
    const { container } = render(NotebooksView, { props: props() });

    await screen.findByText("Work");
    const row = container.querySelector(".notebooks__item");
    expect(row.getAttribute("style")).toContain("var(--app-5-solid)");
  });

  test("a notebook that never chose a colour still gets one", async () => {
    // The app's own accent, solid. Left unset it would fall back to the
    // region's brand — a bright step, meant to be read AS text, with white
    // written over it.
    bridge({ recent_notebooks: [entry("Plain", { accentColor: "" })] });
    const { container } = render(NotebooksView, { props: props() });

    await screen.findByText("Plain");
    expect(container.querySelector(".notebooks__item").getAttribute("style")).toContain(
      "var(--app-1-solid)",
    );
  });

  test("clicking a card hands its path up — the screen opens nothing itself", async () => {
    const onOpen = vi.fn();
    bridge({ recent_notebooks: [entry("Work")] });
    render(NotebooksView, { props: props({ onOpen }) });

    await userEvent.click(await screen.findByText("Work"));
    expect(onOpen).toHaveBeenCalledWith("/home/tonda/Work");
    expect(invoke).not.toHaveBeenCalledWith("open_notebook", expect.anything());
  });

  test("the two doors say which question was asked", async () => {
    // They looked like one button for a reason: they used to BE one, and a
    // folder picked under "open" that was not a notebook silently became one.
    const onChoose = vi.fn();
    bridge({ recent_notebooks: [] });
    render(NotebooksView, { props: props({ onChoose }) });

    await userEvent.click(await screen.findByText("Create a new notebook"));
    expect(onChoose).toHaveBeenCalledWith({ create: true });

    await userEvent.click(screen.getByText("Open a notebook"));
    expect(onChoose).toHaveBeenLastCalledWith({ create: false });
  });

  test("the ⋮ leads with the path, which is what tells two of a name apart", async () => {
    bridge({ recent_notebooks: [entry("Work")] });
    render(NotebooksView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "notebook options" }));
    expect(await screen.findByText("/home/tonda/Work")).toBeTruthy();
    expect(screen.getByText("Rename notebook")).toBeTruthy();
    expect(screen.getByText("Move notebook…")).toBeTruthy();
    expect(screen.getByText("Show in file manager")).toBeTruthy();
    expect(screen.getByText("Remove from the list")).toBeTruthy();
  });

  test("removing asks first, and says what it does not do", async () => {
    bridge({ recent_notebooks: [entry("Work")], forget_notebook: null });
    render(NotebooksView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "notebook options" }));
    await userEvent.click(await screen.findByText("Remove from the list"));

    const asked = await answerConfirm(false);
    expect(asked.title).toContain("Work");
    expect(asked.detail).toContain("stays exactly where it is on disk");
    // Never one of the questions `confirmDeletes` can switch off: that setting
    // lives inside a notebook, and this screen has none open to read it from.
    expect(asked.remember ?? "").toBe("");
    expect(invoke).not.toHaveBeenCalledWith("forget_notebook", expect.anything());
  });

  test("removing, once confirmed, forgets it and re-reads the list", async () => {
    bridge({ recent_notebooks: [entry("Work")], forget_notebook: null });
    render(NotebooksView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "notebook options" }));
    await userEvent.click(await screen.findByText("Remove from the list"));
    await answerConfirm(true);

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("forget_notebook", { path: "/home/tonda/Work" }),
    );
    // The list is the bridge's answer, not a local splice: a rename or a move
    // changes more than the row it was run on.
    expect(invoke.mock.calls.filter(([c]) => c === "recent_notebooks").length).toBeGreaterThan(1);
  });

  test("moving asks the shell for a folder, and does nothing if none comes back", async () => {
    // The screen cannot ask by itself: a system picker on the desktop, the
    // app's own browser on Android, and only the shell knows which.
    const onPickFolder = vi.fn(() => Promise.resolve(null));
    bridge({ recent_notebooks: [entry("Work")], move_notebook: "/elsewhere/Work" });
    render(NotebooksView, { props: props({ onPickFolder }) });

    await userEvent.click(await screen.findByRole("button", { name: "notebook options" }));
    await userEvent.click(await screen.findByText("Move notebook…"));

    await waitFor(() => expect(onPickFolder).toHaveBeenCalled());
    expect(invoke).not.toHaveBeenCalledWith("move_notebook", expect.anything());
  });

  test("moving sends the notebook and the folder it was pointed at", async () => {
    const onPickFolder = vi.fn(() => Promise.resolve("/elsewhere"));
    bridge({ recent_notebooks: [entry("Work")], move_notebook: "/elsewhere/Work" });
    render(NotebooksView, { props: props({ onPickFolder }) });

    await userEvent.click(await screen.findByRole("button", { name: "notebook options" }));
    await userEvent.click(await screen.findByText("Move notebook…"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("move_notebook", {
        path: "/home/tonda/Work",
        into: "/elsewhere",
      }),
    );
  });

  test("a list that cannot be read is reported, and the doors still open", async () => {
    // The two buttons never needed the list. A picker that became an error
    // page would leave someone with no way into their own notebook.
    const onError = vi.fn();
    bridge({ recent_notebooks: () => Promise.reject(new Error("no config dir")) });
    render(NotebooksView, { props: props({ onError }) });

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByText("Create a new notebook")).toBeTruthy();
  });

  test("a read-only notebook says so on its card", async () => {
    bridge({ recent_notebooks: [entry("Future", { readOnly: true })] });
    render(NotebooksView, { props: props() });
    expect(await screen.findByText("read-only")).toBeTruthy();
  });

  // ---- the screen's own ⋮: two questions about WINDOWS ----

  test("the screen menu carries the two window preferences, ticked as stored", async () => {
    bridge({
      recent_notebooks: [entry("Work")],
      picker_closes: false,
      opens_on_picker: true,
    });
    render(NotebooksView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "screen options" }));
    await screen.findByText("Open Jott on this screen");

    // "Keep open" is the INVERSE of "closes": one is the setting, the other is
    // how it reads to someone looking at the screen it is on.
    expect(ticked("Keep this screen open")).toBe(true);
    expect(ticked("Open Jott on this screen")).toBe(true);
  });

  test("with nothing stored the defaults are one notebook at a time", async () => {
    // The picker gets out of the way once it has done its job, and the app
    // comes back to the work rather than to the question.
    bridge({ recent_notebooks: [entry("Work")], picker_closes: true, opens_on_picker: false });
    render(NotebooksView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "screen options" }));
    await screen.findByText("Open Jott on this screen");
    expect(ticked("Keep this screen open")).toBe(false);
    expect(ticked("Open Jott on this screen")).toBe(false);
  });

  test("ticking a row remembers it on the machine", async () => {
    bridge({
      recent_notebooks: [entry("Work")],
      picker_closes: true,
      opens_on_picker: false,
      remember_picker_closes: null,
      remember_opens_on_picker: null,
    });
    render(NotebooksView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "screen options" }));
    await userEvent.click(await screen.findByText("Keep this screen open after opening a notebook"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("remember_picker_closes", { closes: false }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "screen options" }));
    await userEvent.click(await screen.findByText("Open Jott on this screen"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("remember_opens_on_picker", { on: true }),
    );
  });

  test("the way back is offered only where there is something behind it", async () => {
    // The desktop's picker is a window of its own and is closed by closing it.
    // The phone has one window and shows this OVER the open notebook, so it is
    // the only place that needs a way out.
    bridge({ recent_notebooks: [entry("Work")] });
    const onClose = vi.fn();
    const { unmount } = render(NotebooksView, { props: props() });
    await userEvent.click(await screen.findByRole("button", { name: "screen options" }));
    expect(screen.queryByText("Close")).toBeNull();
    unmount();

    render(NotebooksView, { props: props({ onClose }) });
    await userEvent.click(await screen.findByRole("button", { name: "screen options" }));
    await userEvent.click(await screen.findByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  test("an older bridge with no answer still lands on the documented defaults", async () => {
    // `??` and not `||`: a command that is not compiled in answers null, and
    // reading that as "do not close" would leave a picker behind every launch.
    bridge({ recent_notebooks: [entry("Work")] });
    render(NotebooksView, { props: props() });

    await userEvent.click(await screen.findByRole("button", { name: "screen options" }));
    await screen.findByText("Open Jott on this screen");
    expect(ticked("Keep this screen open")).toBe(false);
  });
});
