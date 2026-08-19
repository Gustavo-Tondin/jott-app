// The app's own folder browser — the one Android has instead of a system
// picker. Nobody developing Jott clicks this either (it never opens on the
// desktop), so what it does has to be written down here.

import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, test, expect, vi, beforeEach } from "vitest";

import FolderPicker from "./FolderPicker.svelte";
import { nameRequest } from "../services/dialog.js";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invoke(...args) }));

/// A shared-storage tree, answered the way `list_folders` answers it.
const TREE = {
  "/storage/emulated/0": {
    path: "/storage/emulated/0",
    name: "0",
    parent: null,
    folders: [
      { path: "/storage/emulated/0/Documents", name: "Documents", notebook: false },
      { path: "/storage/emulated/0/Notebook", name: "Notebook", notebook: true },
    ],
  },
  "/storage/emulated/0/Documents": {
    path: "/storage/emulated/0/Documents",
    name: "Documents",
    parent: "/storage/emulated/0",
    folders: [],
  },
};

beforeEach(() => {
  nameRequest.set(null);
  invoke.mockReset();
  invoke.mockImplementation((cmd, args) => {
    if (cmd === "list_folders") return Promise.resolve(TREE[args.path ?? "/storage/emulated/0"]);
    if (cmd === "create_folder") return Promise.resolve(`${args.parent}/${args.name}`);
    return Promise.resolve(null);
  });
});

describe("FolderPicker", () => {
  test("browses down and back up, and says which folder is already a notebook", async () => {
    render(FolderPicker, { props: { onChoose: () => {}, onClose: () => {} } });

    // The badge is why the browser lists this at all: opening an existing
    // notebook must not look like creating one.
    await screen.findByText("Notebook");
    expect(screen.getByText("notebook")).toBeTruthy();
    expect(screen.queryByText("Up one folder")).toBeNull();

    await userEvent.click(screen.getByText("Documents"));
    await screen.findByText("No folders here.");
    // The whole path, because a browser that cannot say where it is makes the
    // user count folders backwards.
    expect(screen.getByText("/storage/emulated/0/Documents")).toBeTruthy();

    await userEvent.click(screen.getByText("Up one folder"));
    await screen.findByText("Documents");
  });

  test("answers the folder it is standing in, not the one last tapped", async () => {
    const chosen = vi.fn();
    render(FolderPicker, { props: { onChoose: chosen, onClose: () => {} } });

    await userEvent.click(await screen.findByText("Documents"));
    await screen.findByText("No folders here.");
    await userEvent.click(screen.getByText("Use this folder"));

    expect(chosen).toHaveBeenCalledWith("/storage/emulated/0/Documents");
  });

  test("a new folder is entered, not just created", async () => {
    // Making a folder is how someone says where the notebook goes; landing
    // anywhere else would be asking the same question twice.
    render(FolderPicker, { props: { onChoose: () => {}, onClose: () => {} } });
    await screen.findByText("Documents");

    await userEvent.click(screen.getByText("New folder"));
    const request = await waitFor(() => {
      let value;
      nameRequest.subscribe((r) => (value = r))();
      expect(value).toBeTruthy();
      return value;
    });

    TREE["/storage/emulated/0/Jott"] = {
      path: "/storage/emulated/0/Jott",
      name: "Jott",
      parent: "/storage/emulated/0",
      folders: [],
    };
    request.resolve("Jott");

    await waitFor(() => expect(screen.getByText("/storage/emulated/0/Jott")).toBeTruthy());
    expect(invoke).toHaveBeenCalledWith("create_folder", {
      parent: "/storage/emulated/0",
      name: "Jott",
    });
  });

  test("starts where it is told, so changing a notebook opens next to the old one", async () => {
    render(FolderPicker, {
      props: { start: "/storage/emulated/0/Documents", onChoose: () => {}, onClose: () => {} },
    });

    await screen.findByText("No folders here.");
    expect(invoke).toHaveBeenCalledWith("list_folders", { path: "/storage/emulated/0/Documents" });
  });
});
