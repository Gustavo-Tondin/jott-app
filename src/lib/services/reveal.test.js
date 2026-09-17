import { describe, test, expect, vi, afterEach, beforeEach } from "vitest";
import { get } from "svelte/store";

import { bridge, invoke, resetBridge } from "../test/bridge.js";
import { opensInFilesApp, revealFolder, revealed } from "./reveal.js";

beforeEach(() => {
  resetBridge();
  bridge({ open_in_file_manager: null, folder_path: "/storage/emulated/0/Notes/jott.tasks" });
  revealed.set(null);
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

afterEach(() => {
  delete window.JottAndroid;
});

describe("showing where a file lives", () => {
  test("the desktop hands the address to its file manager", async () => {
    expect(await revealFolder("jott.tasks/task-list.md")).toBe("opened");
    expect(invoke).toHaveBeenCalledWith("open_in_file_manager", { path: "jott.tasks/task-list.md" });
    expect(invoke).not.toHaveBeenCalledWith("folder_path", expect.anything());
  });

  test("Android opens the folder in the Files app", async () => {
    window.JottAndroid = { openFolder: vi.fn(() => true) };
    expect(await revealFolder("jott.tasks/task-list.md")).toBe("opened");
    expect(window.JottAndroid.openFolder).toHaveBeenCalledWith("/storage/emulated/0/Notes/jott.tasks");
    expect(invoke).toHaveBeenCalledWith("folder_path", { path: "jott.tasks/task-list.md" });
    expect(invoke).not.toHaveBeenCalledWith("open_in_file_manager", expect.anything());
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  test("where no app opens it, the path is copied and said", async () => {
    window.JottAndroid = { openFolder: vi.fn(() => false) };
    expect(await revealFolder(null)).toBe("copied");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/storage/emulated/0/Notes/jott.tasks");
    expect(get(revealed)).toEqual({ folder: "/storage/emulated/0/Notes/jott.tasks" });
  });

  test("a bridge that throws copies instead of failing", async () => {
    window.JottAndroid = {
      openFolder: () => {
        throw new Error("gone");
      },
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await revealFolder(null)).toBe("copied");
  });

  test("only the phone opens folders in its Files app", () => {
    expect(opensInFilesApp()).toBe(false);
    window.JottAndroid = { openFolder: () => true };
    expect(opensInFilesApp()).toBe(true);
  });
});
