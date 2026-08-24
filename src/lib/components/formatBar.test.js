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
// It is NOT the column with a scrollbar: twenty-three glyphs do not fit on a
// phone and a bar you have to scroll to reach bold is a bar nobody uses. It
// draws one glyph per category and folds the category behind it.
describe("FormatBar, narrow", () => {
  const row = (onRun = () => {}) =>
    render(FormatBar, { props: { onRun, layout: "row" } });

  const editorCommands = COMMANDS.filter((c) => c.scope === "editor" && c.icon);
  const groups = [...new Set(editorCommands.map((c) => c.group))];

  it("shows one button per category, undoing drawn flat", () => {
    const { container } = row();
    // The five folds, plus undo and redo, which are two and so stay flat.
    expect(container.querySelectorAll(".format-bar__button").length).toBe(
      groups.length - 1 + 2,
    );
    expect(screen.getByLabelText("Text style")).toBeTruthy();
    expect(screen.getByLabelText("Heading")).toBeTruthy();
    expect(screen.getByLabelText("Block")).toBeTruthy();
    expect(screen.getByLabelText("List")).toBeTruthy();
    expect(screen.getByLabelText("Insert")).toBeTruthy();
    // Folded, not dropped: bold is not on the bar itself.
    expect(screen.queryByTitle("Bold [Ctrl+B]")).toBeNull();
  });

  // The report that caused this shape (2026-08-19): the bar named nine commands
  // by hand, so the six it did not name — outdent, quote, rule, ordered list,
  // task list, link to a note — could not be reached on a phone AT ALL. What
  // the column holds, the bar holds.
  it("reaches every command the column draws, flat or folded", async () => {
    const { container } = row();
    const openers = [...container.querySelectorAll('[aria-expanded]')];
    const reached = new Set(
      [...container.querySelectorAll(".format-bar__button")]
        .filter((b) => !b.hasAttribute("aria-expanded"))
        .map((b) => b.getAttribute("aria-label")),
    );
    for (const opener of openers) {
      await userEvent.click(opener);
      // The unfolded panel is PORTALED out of the bar (`keepOnScreen`), so it
      // is not under `container` — it hangs off the body.
      for (const button of document.querySelectorAll(
        ".format-bar__panel .format-bar__button",
      )) {
        reached.add(button.getAttribute("aria-label"));
      }
    }
    for (const command of editorCommands) {
      const chord = command.keys;
      const label = command.label();
      expect(
        [...reached].some((seen) => seen === label || seen.startsWith(`${label} [`)),
        `${command.id} (${label}${chord ? ` ${chord}` : ""}) is unreachable`,
      ).toBe(true);
    }
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

  it("draws no category rules — each category is already one glyph", () => {
    const { container } = row();
    expect(container.querySelectorAll(".format-bar__divider").length).toBe(0);
  });
});

// ---- the rail: the same narrow bar, stood on end (2026-08-21) ----
//
// It hugs the left or the right edge of the canvas, which is a Display
// choice. The thing worth guarding is that it is a THIRD ARRANGEMENT and not
// a third list: what the row holds, the rail holds, or moving the bar to the
// side would quietly cost the user six commands.
describe("FormatBar, rail", () => {
  const rail = (onRun = () => {}) =>
    render(FormatBar, { props: { onRun, layout: "rail" } });

  const drawn = (container) =>
    [...container.querySelectorAll(".format-bar__button")].map((b) =>
      b.getAttribute("aria-label"),
    );

  it("draws exactly what the row draws, in the same order", () => {
    const { container: railed } = rail();
    const railButtons = drawn(railed);
    const { container: rowed } = render(FormatBar, {
      props: { onRun: () => {}, layout: "row" },
    });
    expect(railButtons).toEqual(drawn(rowed));
    expect(railButtons.length).toBeGreaterThan(0);
  });

  it("says it is vertical, which is what a screen reader arrows through", () => {
    const { container } = rail();
    const bar = container.querySelector(".format-bar");
    expect(bar.getAttribute("aria-orientation")).toBe("vertical");
    expect(bar.classList.contains("format-bar--rail")).toBe(true);
  });

  it("folds and runs the same as the row does", async () => {
    const asked = [];
    rail((id) => asked.push(id));
    await userEvent.click(screen.getByLabelText("Text style"));
    await userEvent.click(screen.getByTitle("Bold [Ctrl+B]"));
    expect(asked).toEqual(["md.bold"]);
  });

  // Above and below a column of seven buttons there is no room; beside it
  // there is nothing but document. The class is what says which axis the
  // panel opened in before `keepOnScreen` has measured anything.
  it("opens its folded group SIDEWAYS", async () => {
    rail();
    await userEvent.click(screen.getByLabelText("Heading"));
    const panel = document.querySelector(".format-bar__panel");
    expect(panel).toBeTruthy();
    expect(panel.classList.contains("format-bar__panel--beside")).toBe(true);
  });

  it("...which the row does not", async () => {
    render(FormatBar, { props: { onRun: () => {}, layout: "row" } });
    await userEvent.click(screen.getByLabelText("Heading"));
    const panel = document.querySelector(".format-bar__panel");
    expect(panel.classList.contains("format-bar__panel--beside")).toBe(false);
  });

  it("draws no category rules either", () => {
    const { container } = rail();
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
    expect(buttons.length).toBeGreaterThan(0);
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
    await userEvent.click(screen.getByLabelText("List"));
    await userEvent.click(screen.getByTitle("Bullet list [Ctrl+Shift+8]"));
    expect(asked).toEqual(["md.bullet"]);
  });
});

// ---- the table's category (2026-08-24) ----
//
// Flat in the column (there is room), folded and labelled in the narrow
// bar, greyed by where the caret is.
describe("FormatBar, table", () => {
  it("draws the six flat in the column, greyed where they do not apply", () => {
    render(FormatBar, { props: { onRun: () => {}, inactive: ["table.addRow"] } });
    expect(screen.getByTitle("Add row below").disabled).toBe(true);
    expect(screen.getByTitle("Insert table").disabled).toBe(false);
    expect(document.querySelector(".format-bar__panel--labelled")).toBe(null);
  });

  it("folds the table behind one labelled opener in the narrow bar", async () => {
    render(FormatBar, { props: { onRun: () => {}, layout: "row" } });
    expect(screen.queryByTitle("Add row below")).toBe(null);
    await userEvent.click(screen.getByTitle("Table"));
    // `document`, not the container: `keepOnScreen` portals the panel to the body.
    const panel = document.querySelector(".format-bar__panel--labelled");
    expect(panel).not.toBe(null);
    expect(panel.querySelectorAll(".format-bar__label").length).toBe(6);
    expect(screen.getByTitle("Add row below").textContent).toContain("Add row below");
  });

  it("greys the ids it is told are inactive, and still names them", async () => {
    const asked = [];
    render(FormatBar, {
      props: { onRun: (id) => asked.push(id), inactive: ["table.addRow"], layout: "row" },
    });
    await userEvent.click(screen.getByTitle("Table"));
    const row = screen.getByTitle("Add row below");
    expect(row.disabled).toBe(true);
    await userEvent.click(row);
    await userEvent.click(screen.getByTitle("Insert table"));
    expect(asked).toEqual(["table.insert"]);
  });

  it("leaves the opener out when every table command is hidden", () => {
    const hidden = COMMANDS.filter((c) => c.group === "table").map((c) => c.id);
    render(FormatBar, { props: { onRun: () => {}, hidden } });
    expect(screen.queryByTitle("Table")).toBe(null);
  });
});
