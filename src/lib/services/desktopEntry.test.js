import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api.js", () => ({
  api: {
    desktopEntryState: vi.fn(),
    setDesktopEntry: vi.fn(() => Promise.resolve()),
    dismissDesktopEntry: vi.fn(() => Promise.resolve()),
  },
}));

const { api } = await import("./api.js");
const { offerIfDue, addToMenu, removeFromMenu, dismiss } = await import("./desktopEntry.js");

const offerable = { supported: true, installed: false, stale: false, dismissed: false };

beforeEach(() => {
  // `clearAllMocks` forgets the CALLS, not the implementations — a rejection
  // set up in one test would otherwise still be armed in the next one.
  vi.clearAllMocks();
  api.desktopEntryState.mockResolvedValue(offerable);
  api.setDesktopEntry.mockResolvedValue(undefined);
  api.dismissDesktopEntry.mockResolvedValue(undefined);
});

describe("offerIfDue", () => {
  test("an AppImage that is not in the menu is asked once", async () => {
    expect(await offerIfDue()).toEqual(offerable);
  });

  test("a packaged install is never asked", async () => {
    // The deb, the rpm, the PKGBUILD and the Windows installer all put Jott
    // in the menu themselves; a second entry would show the app twice.
    api.desktopEntryState.mockResolvedValue({ ...offerable, supported: false });
    expect(await offerIfDue()).toBe(null);
  });

  test("already in the menu is not an offer", async () => {
    api.desktopEntryState.mockResolvedValue({ ...offerable, installed: true });
    expect(await offerIfDue()).toBe(null);
    expect(api.setDesktopEntry).not.toHaveBeenCalled();
  });

  test("an update with a new icon refreshes the entry without asking", async () => {
    // The in-place update replaces the .AppImage and nothing else, so the PNG
    // on disk is still the old one. The user said yes months ago; rewriting
    // the files is that same answer, not a new question.
    api.desktopEntryState.mockResolvedValue({ ...offerable, installed: true, stale: true });

    expect(await offerIfDue()).toBe(null);
    expect(api.setDesktopEntry).toHaveBeenCalledWith(true);
  });

  test("a stale entry is refreshed even where the offer was once refused", async () => {
    // "No thanks" answered a question about JOINING the menu. It says nothing
    // about an entry that is already there — one the user later added from
    // Settings.
    api.desktopEntryState.mockResolvedValue({
      ...offerable,
      installed: true,
      stale: true,
      dismissed: true,
    });

    expect(await offerIfDue()).toBe(null);
    expect(api.setDesktopEntry).toHaveBeenCalledWith(true);
  });

  test("a failed refresh does not break the launch", async () => {
    api.desktopEntryState.mockResolvedValue({ ...offerable, installed: true, stale: true });
    api.setDesktopEntry.mockRejectedValue(new Error("read-only home"));
    expect(await offerIfDue()).toBe(null);
  });

  test("no thanks is remembered, so it is asked once and not every launch", async () => {
    api.desktopEntryState.mockResolvedValue({ ...offerable, dismissed: true });
    expect(await offerIfDue()).toBe(null);
  });

  test("a bridge that does not know the command stays quiet", async () => {
    // An older build, or the mobile bundle, where the command was never
    // compiled in. Not being in the menu is not worth an error on launch.
    api.desktopEntryState.mockRejectedValue(new Error("unknown command"));
    expect(await offerIfDue()).toBe(null);
  });

  test("a bridge answering nothing stays quiet too", async () => {
    api.desktopEntryState.mockResolvedValue(undefined);
    expect(await offerIfDue()).toBe(null);
  });
});

describe("the two directions", () => {
  test("adding and removing are the same command, opposite sides", async () => {
    await addToMenu();
    expect(api.setDesktopEntry).toHaveBeenCalledWith(true);

    await removeFromMenu();
    expect(api.setDesktopEntry).toHaveBeenCalledWith(false);
  });

  test("dismissing does not write an entry", async () => {
    await dismiss();
    expect(api.dismissDesktopEntry).toHaveBeenCalled();
    expect(api.setDesktopEntry).not.toHaveBeenCalled();
  });
});
