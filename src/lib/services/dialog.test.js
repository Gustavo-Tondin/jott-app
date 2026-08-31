// The confirm dialog's POLICY — the half of "don't ask again" that lives here.
//
// Saving the answer was never the broken part (user report, 2026-08-31): the
// checkbox wrote `confirmDeletes: false` into the notebook and Settings read
// it back correctly. What was missing was the flag reaching the shell, which
// installs this policy from the notebook's layout — so nothing ever met the
// condition below and the question came again every time. These tests hold
// this end; `src-tauri/tests/bridge.rs` holds the other.

import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { askConfirm, confirmRequest, DELETING, setConfirmPolicy } from "./dialog.js";

beforeEach(() => {
  confirmRequest.set(null);
  setConfirmPolicy({ settings: {}, save: () => {} });
});

/// Answers the dialog that is currently open.
const answer = (reply) => get(confirmRequest).resolve(reply);

describe("askConfirm", () => {
  it("asks, and resolves what the person clicked", async () => {
    const asked = askConfirm("Delete photo.jpg?", DELETING);
    expect(get(confirmRequest).title).toBe("Delete photo.jpg?");
    expect(get(confirmRequest).remember).toBe("confirmDeletes");
    answer({ ok: true });
    expect(await asked).toBe(true);
  });

  it("saves the setting when the box is ticked, and only then", async () => {
    const save = vi.fn();
    setConfirmPolicy({ save });

    await Promise.all([askConfirm("Delete?", DELETING), answer({ ok: true })]);
    expect(save).not.toHaveBeenCalled();

    await Promise.all([askConfirm("Delete?", DELETING), answer({ ok: true, stopAsking: true })]);
    expect(save).toHaveBeenCalledWith("confirmDeletes");
  });

  // THE REGRESSION. With the answer in hand the question is not asked at all
  // — no dialog is opened, and the caller is told yes.
  it("does not ask at all once the setting says not to", async () => {
    setConfirmPolicy({ settings: { confirmDeletes: false } });
    const asked = askConfirm("Delete photo.jpg?", DELETING);
    expect(get(confirmRequest)).toBe(null);
    expect(await asked).toBe(true);
  });

  it("keeps asking while the setting is on, or unknown", () => {
    setConfirmPolicy({ settings: { confirmDeletes: true } });
    askConfirm("Delete?", DELETING);
    expect(get(confirmRequest)).not.toBe(null);

    confirmRequest.set(null);
    // A layout that does not carry the key at all: the safe answer is to ask.
    setConfirmPolicy({ settings: {} });
    askConfirm("Delete?", DELETING);
    expect(get(confirmRequest)).not.toBe(null);
  });

  it("has nothing to remember without a key, and always asks", () => {
    setConfirmPolicy({ settings: { confirmDeletes: false } });
    askConfirm("Empty the trash?", { danger: "Empty" });
    expect(get(confirmRequest).remember).toBe("");
  });
});
