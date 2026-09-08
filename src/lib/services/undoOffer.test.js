import { describe, expect, test, vi } from "vitest";
import { announce, onOffer } from "./undoOffer.js";

describe("undoOffer", () => {
  test("only what vanished or moved is offered back, to the latest ear", () => {
    const first = vi.fn();
    const stop = onOffer(first);
    announce("delete_task");
    announce("set_task_fields");
    announce("move_note_to_space");
    expect(first.mock.calls.map(([c]) => c)).toEqual(["delete_task", "move_note_to_space"]);

    const second = vi.fn();
    onOffer(second);
    announce("remove_from");
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledWith("remove_from");

    // Stopping the old ear does not unplug the new one.
    stop();
    announce("delete_note");
    expect(second).toHaveBeenCalledWith("delete_note");
  });
});
