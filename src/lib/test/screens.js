// The floor every screen test stands on: the jsdom gaps they have to fill, the
// shapes the bridge answers with, and the reset that runs before each one.
//
// Screen tests with the bridge mocked.
//
// What these catch: a button wired to the wrong command, arguments in the
// wrong shape, a screen that never reloads after acting, an action offered
// on a read-only notebook. What they deliberately do NOT check is whether
// the core does the right thing with those calls — that lives in Rust, and
// duplicating it here would just be a slower copy.
//
// One file per screen, in `lib/screenTests/`. The one thing that could not
// move here is the stub of the note editor: its engine is CodeMirror, which
// needs a real layout jsdom cannot give it, so those tests replace it with a
// textarea and the live-preview rule is tested on its own in
// `markdown.test.js`. `vi.mock` is hoisted per file, so each screen file that
// reaches the editor carries that line itself.

import { screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";
import { pace } from "../services/pace.js";
import { confirmRequest, nameRequest, taskRequest } from "../services/dialog.js";
import { resetBridge } from "./bridge.js";

// Svelte 5 transitions (the inspector's slide) drive the Web Animations API,
// which jsdom does not implement. A no-op that reports "already finished" — and
// fires onfinish once assigned — lets a transitioned element mount and unmount.
if (typeof Element !== "undefined" && !Element.prototype.animate) {
  Element.prototype.animate = () => {
    const anim = {
      cancel() {},
      finished: Promise.resolve(),
      onfinish: null,
      oncancel: null,
      currentTime: 0,
      startTime: 0,
      playState: "finished",
      play() {},
      pause() {},
      reverse() {},
      finish() {},
      commitStyles() {},
      persist() {},
      updatePlaybackRate() {},
      addEventListener() {},
      removeEventListener() {},
    };
    Promise.resolve().then(() => anim.onfinish?.());
    return anim;
  };
  Element.prototype.getAnimations = () => [];
}

/// Answers the app's own confirmation dialog, which replaced window.confirm
/// (2026-08-19). `ConfirmDialog` is mounted by the shell, so a test that
/// renders one screen has to play its part.
export async function answerConfirm(answer = true) {
  const { get } = await import("svelte/store");
  await vi.waitFor(() => expect(get(confirmRequest)).toBeTruthy());
  const asked = get(confirmRequest);
  confirmRequest.set(null);
  asked.resolve({ ok: answer, stopAsking: false });
  return asked;
}

/// Answers the name dialog the screen just opened, the way `answerConfirm`
/// answers the confirmation — `null` for cancel.
export async function answerName(name) {
  const { get } = await import("svelte/store");
  const { nameRequest } = await import("../services/dialog.js");
  await vi.waitFor(() => expect(get(nameRequest)).toBeTruthy());
  const asked = get(nameRequest);
  nameRequest.set(null);
  asked.resolve(name);
  return asked;
}

/// Gives a set of elements a layout jsdom does not compute: one column of
/// 200x200 boxes starting at `top`. Dragging is geometry, so a drag test has
/// to say where things are.
export function place(elements, top) {
  elements.forEach((el, i) => {
    const y = top + i * 220;
    el.getBoundingClientRect = () => ({
      left: 10,
      right: 210,
      width: 200,
      top: y,
      bottom: y + 200,
      height: 200,
      x: 10,
      y,
      toJSON() {},
    });
  });
}

/// A folder of notes as the bridge answers it since 2026-08-19: an address,
/// plus the colour and the pin the SPACE remembers for it.
export const noteFolder = (path, extra = {}) => ({ path, color: null, pinned: false, ...extra });

/// A task as the bridge answers it.
export const task = (id, text, extra = {}) => ({
  id,
  text,
  done: false,
  origin: null,
  meta: null,
  indent: "",
  ...extra,
});

export const noop = () => {};

/// The clock every screen test runs under: a Tuesday, with the two turns ahead.
export const CLOCK = {
  today: "2026-07-21",
  weekStart: "2026-07-20",
  nextDailyTurn: "2026-07-22T00:00:00Z",
  nextWeeklyTurn: "2026-07-27T00:00:00Z",
};

/// One note as `list_notes` lists it (`listed`) and as `read_note` reads it (`read`).
export const noteFixture = (path, { body = "Corpo.", preview = "preview", pinned = false } = {}) => {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const title = path.slice(folder.length + 1).replace(/\.md$/, "");
  const created = CLOCK.today;
  return {
    listed: { path, title, folder, preview, created, pinned },
    read: { path, title, body, pinned, created },
  };
};
/// Fresh objects each call: the shell mutates what the bridge hands it.
export const ideia = () => noteFixture("Inbox/Ideia.md");

/// The board's ⋮ → Layout → Folders. The two view buttons that used to sit
/// above the cards are menu items since the 2026-08-19 redraw, so every test
/// that wants the tree view comes through here.
export const showFolders = async () => {
  await userEvent.click(await screen.findByLabelText("space options"));
  await userEvent.click(await screen.findByText("Layout"));
  await userEvent.click(await screen.findByText("Folders"));
};

/// What every screen test runs before its test.
export function resetScreens() {
  resetBridge();
  // The completion beat is a real-user pause; tests stay instant.
  pace.completionMs = 0;
  // The two dialog requests are module-level stores: a test that leaves one
  // open would put every test after it behind a modal.
  nameRequest.set(null);
  confirmRequest.set(null);
  taskRequest.set(null);
}
