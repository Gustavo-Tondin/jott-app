import { beforeEach, describe, expect, test } from "vitest";

import { bridge, commandsCalled, fails, invoke, resetBridge } from "../test/bridge.js";
import { offerIfDue, addToMenu, removeFromMenu, dismiss } from "./desktopEntry.js";

const offerable = { supported: true, installed: false, stale: false, dismissed: false };

/// The state the bridge reports, with this test's difference on top. Writing
/// the whole table each time is what keeps a rejection set up in one test from
/// being still armed in the next one.
const reports = (over = {}, rest = {}) =>
  bridge({ desktop_entry_state: { ...offerable, ...over }, ...rest });

beforeEach(() => {
  resetBridge();
  reports();
});

describe("offerIfDue", () => {
  test("an AppImage that is not in the menu is asked once", async () => {
    expect(await offerIfDue()).toEqual(offerable);
  });

  test("a packaged install is never asked", async () => {
    // The deb, the rpm, the PKGBUILD and the Windows installer all put Jott
    // in the menu themselves; a second entry would show the app twice.
    reports({ supported: false });
    expect(await offerIfDue()).toBe(null);
  });

  test("already in the menu is not an offer", async () => {
    reports({ installed: true });
    expect(await offerIfDue()).toBe(null);
    expect(commandsCalled()).not.toContain("set_desktop_entry");
  });

  test("an update with a new icon refreshes the entry without asking", async () => {
    // The in-place update replaces the .AppImage and nothing else, so the PNG
    // on disk is still the old one. The user said yes months ago; rewriting
    // the files is that same answer, not a new question.
    reports({ installed: true, stale: true });

    expect(await offerIfDue()).toBe(null);
    expect(invoke).toHaveBeenCalledWith("set_desktop_entry", { on: true });
  });

  test("a stale entry is refreshed even where the offer was once refused", async () => {
    // "No thanks" answered a question about JOINING the menu. It says nothing
    // about an entry that is already there — one the user later added from
    // Settings.
    reports({ installed: true, stale: true, dismissed: true });

    expect(await offerIfDue()).toBe(null);
    expect(invoke).toHaveBeenCalledWith("set_desktop_entry", { on: true });
  });

  test("a failed refresh does not break the launch", async () => {
    reports({ installed: true, stale: true }, { set_desktop_entry: fails("read-only home") });
    expect(await offerIfDue()).toBe(null);
  });

  test("no thanks is remembered, so it is asked once and not every launch", async () => {
    reports({ dismissed: true });
    expect(await offerIfDue()).toBe(null);
  });

  test("a bridge that does not know the command stays quiet", async () => {
    // An older build, or the mobile bundle, where the command was never
    // compiled in. Not being in the menu is not worth an error on launch.
    bridge({ desktop_entry_state: fails("unknown command") });
    expect(await offerIfDue()).toBe(null);
  });

  test("a bridge answering nothing stays quiet too", async () => {
    bridge({ desktop_entry_state: undefined });
    expect(await offerIfDue()).toBe(null);
  });
});

describe("the two directions", () => {
  test("adding and removing are the same command, opposite sides", async () => {
    await addToMenu();
    expect(invoke).toHaveBeenCalledWith("set_desktop_entry", { on: true });

    await removeFromMenu();
    expect(invoke).toHaveBeenCalledWith("set_desktop_entry", { on: false });
  });

  test("dismissing does not write an entry", async () => {
    await dismiss();
    expect(commandsCalled()).toContain("dismiss_desktop_entry");
    expect(commandsCalled()).not.toContain("set_desktop_entry");
  });
});
