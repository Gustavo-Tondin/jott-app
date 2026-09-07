// The two shelves of Icon.svelte (2026-09-07): a bundled name draws at once,
// a name from the library draws once the library has been read, and a name
// nobody has draws nothing rather than throwing.

import { render, waitFor } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";

import Icon from "./Icon.svelte";
import { ICONS } from "./icons.js";

describe("Icon", () => {
  test("a bundled name draws synchronously", () => {
    const { container } = render(Icon, { props: { name: "folder" } });
    expect(container.querySelector("svg")).toBeTruthy();
  });

  test("a library name draws once the library is read", async () => {
    // Not in the bundle: the picker is the only way to wear it.
    expect(ICONS.acorn).toBeUndefined();
    const { container } = render(Icon, { props: { name: "acorn" } });
    expect(container.querySelector("svg")).toBeNull();
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy(), {
      timeout: 20_000,
    });
  }, 30_000);

  test("a name nobody has stays empty", async () => {
    const { container } = render(Icon, { props: { name: "no-such-glyph" } });
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector("svg")).toBeNull();
  });
});
