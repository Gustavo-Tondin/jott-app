// What a window is for, read off its address.

import { describe, expect, test } from "vitest";
import { entryOf } from "./entry.js";

describe("entryOf", () => {
  test("no question means the first window, which asks the machine", () => {
    expect(entryOf("")).toEqual({ kind: "remembered" });
    expect(entryOf("?")).toEqual({ kind: "remembered" });
  });

  test("`?picker` is a window that opens on the notebooks screen", () => {
    expect(entryOf("?picker")).toEqual({ kind: "picker" });
  });

  test("`?notebook=` carries the folder, percent-decoded", () => {
    // A folder may be called anything at all, which is the whole reason the
    // value is encoded on the way out: a `&` or a `#` in the name would cut
    // the address in half and the window would open somewhere else.
    expect(entryOf("?notebook=%2Fhome%2Ftonda%2FTrabalho")).toEqual({
      kind: "notebook",
      path: "/home/tonda/Trabalho",
    });
    expect(entryOf("?notebook=%2Ftmp%2FA%20%26%20B%20%23-1")).toEqual({
      kind: "notebook",
      path: "/tmp/A & B #-1",
    });
  });

  test("an empty notebook is not a path", () => {
    // It would reach `open_notebook` as "" and come back as "is not a Jott
    // notebook" — an error about a folder the user never chose.
    expect(entryOf("?notebook=")).toEqual({ kind: "remembered" });
  });

  test("the picker wins over a notebook, so one address means one thing", () => {
    expect(entryOf("?picker&notebook=%2Ftmp%2FX")).toEqual({ kind: "picker" });
  });
});
