// The formatting panel.
//
// What matters here is the pact with the registry, because it is the whole
// reason the panel is built this way: a button presses the same command its
// chord presses, and its tooltip reads the chord that is bound RIGHT NOW.

import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import FormatBar from "./FormatBar.svelte";
import { userBindings } from "../services/shortcuts.js";
import { COMMANDS } from "../services/commands.js";

beforeEach(() => userBindings.set({}));

describe("FormatBar", () => {
  it("names the command and the chord, the way the user asked: Bold [Ctrl+B]", () => {
    render(FormatBar, { props: { onRun: () => {} } });
    expect(screen.getByTitle("Bold [Ctrl+B]")).toBeTruthy();
    expect(screen.getByTitle("Italic [Ctrl+I]")).toBeTruthy();
    expect(screen.getByTitle("Heading 1 [Ctrl+Alt+1]")).toBeTruthy();
  });

  it("keeps telling the truth after a rebinding", () => {
    // The reason the chord is read from the registry instead of written into
    // the button: a key written in by hand would go stale here.
    userBindings.set({ "md.bold": "Mod+Shift+B" });
    render(FormatBar, { props: { onRun: () => {} } });
    expect(screen.getByTitle("Bold [Ctrl+Shift+B]")).toBeTruthy();
  });

  it("shows just the name for a command with no chord", () => {
    userBindings.set({ "md.bold": null });
    render(FormatBar, { props: { onRun: () => {} } });
    expect(screen.getByTitle("Bold")).toBeTruthy();
  });

  it("asks for the command by the id the keymap uses", async () => {
    const asked = [];
    render(FormatBar, { props: { onRun: (id) => asked.push(id) } });
    await userEvent.click(screen.getByTitle("Bold [Ctrl+B]"));
    expect(asked).toEqual(["md.bold"]);
  });

  it("draws every editor command that named an icon, and only those", () => {
    const { container } = render(FormatBar, { props: { onRun: () => {} } });
    const drawn = container.querySelectorAll(".format-bar__button");
    const expected = COMMANDS.filter((c) => c.scope === "editor" && c.icon);
    expect(drawn.length).toBe(expected.length);
    // A command the panel draws but nothing can run would be a dead button.
    expect(expected.length).toBeGreaterThan(0);
  });
});

// ---- the narrow bar (2026-08-19, wireframes "Format panel") ----
//
// It is NOT the column with a scrollbar: nineteen glyphs do not fit on a phone
// and a bar you have to scroll to reach bold is a bar nobody uses. Two of its
// buttons are openers, and what they hold is the rest.
describe("FormatBar, narrow", () => {
  const row = (onRun = () => {}) =>
    render(FormatBar, { props: { onRun, layout: "row" } });

  it("shows nine buttons, two of which open a group", () => {
    const { container } = row();
    expect(container.querySelectorAll(".format-bar__button").length).toBe(9);
    expect(screen.getByLabelText("Text style")).toBeTruthy();
    expect(screen.getByLabelText("Heading")).toBeTruthy();
    // Folded, not dropped: bold is not on the bar itself.
    expect(screen.queryByTitle("Bold [Ctrl+B]")).toBeNull();
  });

  it("an opener unfolds its group, and running one closes it again", async () => {
    const asked = [];
    row((id) => asked.push(id));

    await userEvent.click(screen.getByLabelText("Text style"));
    expect(screen.getByTitle("Bold [Ctrl+B]")).toBeTruthy();
    expect(screen.getByTitle("Underline [Ctrl+U]")).toBeTruthy();

    await userEvent.click(screen.getByTitle("Underline [Ctrl+U]"));
    expect(asked).toEqual(["md.underline"]);
    expect(screen.queryByTitle("Bold [Ctrl+B]")).toBeNull();
  });

  it("opens one group at a time", async () => {
    row();
    await userEvent.click(screen.getByLabelText("Text style"));
    await userEvent.click(screen.getByLabelText("Heading"));
    expect(screen.getByTitle("Heading 1 [Ctrl+Alt+1]")).toBeTruthy();
    expect(screen.queryByTitle("Bold [Ctrl+B]")).toBeNull();
  });

  it("draws no category rules — nine glyphs are not nineteen", () => {
    const { container } = row();
    expect(container.querySelectorAll(".format-bar__divider").length).toBe(0);
  });
});

// ---- the focus stays in the note (user report, 2026-08-19) ----
//
// "Clicking the formatting items closes the keyboard." Reproduced on the
// emulator: a real tap on the `A` opener left `document.activeElement` on the
// BODY, the strip — which is tied to the editor holding the focus — unmounted
// mid-tap, and the panel never opened. Pressing a button focuses it by
// default, and that default is the whole bug.
describe("FormatBar and the focus", () => {
  const pressing = (button) => {
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("refuses the focus on every button of the narrow bar", () => {
    const { container } = render(FormatBar, {
      props: { onRun: () => {}, layout: "row" },
    });
    const buttons = [...container.querySelectorAll(".format-bar__button")];
    expect(buttons.length).toBe(9);
    for (const button of buttons) {
      expect(pressing(button), button.getAttribute("aria-label")).toBe(true);
    }
  });

  it("refuses it inside an unfolded group too", async () => {
    render(FormatBar, { props: { onRun: () => {}, layout: "row" } });
    await userEvent.click(screen.getByLabelText("Text style"));
    expect(pressing(screen.getByTitle("Bold [Ctrl+B]"))).toBe(true);
  });

  it("refuses it in the desktop column, where the same loss moves the caret", () => {
    const { container } = render(FormatBar, { props: { onRun: () => {} } });
    for (const button of container.querySelectorAll(".format-bar__button")) {
      expect(pressing(button), button.getAttribute("aria-label")).toBe(true);
    }
  });

  it("still runs the command it was pressed for", async () => {
    // Cancelling the default takes the focus away, not the click.
    const asked = [];
    render(FormatBar, { props: { onRun: (id) => asked.push(id), layout: "row" } });
    await userEvent.click(screen.getByTitle("Bullet list [Ctrl+Shift+8]"));
    expect(asked).toEqual(["md.bullet"]);
  });
});
