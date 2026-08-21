// The head of a note — a colour or an image.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { noop, resetScreens } from "../test/screens.js";
import NoteBanner from "../components/NoteBanner.svelte";

beforeEach(resetScreens);

describe("NoteBanner", () => {
  const props = (extra = {}) => ({
    banner: null,
    title: "Ideia",
    root: "/home/gus/Caderno",
    readOnly: false,
    onSet: noop,
    onChooseImage: noop,
    ...extra,
  });

  test("a note with no banner keeps its title, in the same place", () => {
    // The head is ONE box whose block has a colour and a height only when the
    // note asks for one (user call, 2026-08-19). So the title is drawn either
    // way, and it is the same element in both — what goes away is the fill.
    const { container } = render(NoteBanner, { props: props() });

    expect(screen.getByText("Ideia")).toBeTruthy();
    expect(container.querySelector(".note-banner__title")).toBeTruthy();
    expect(container.querySelector(".note-banner--empty")).toBeTruthy();
  });

  test("a note with no banner is where one is chosen from", () => {
    // The ⋮ is on the head, not on the block: with no banner there would be
    // nowhere to open one from at all, and "add a banner" would live only in
    // the page menu two screens away.
    render(NoteBanner, { props: props() });
    expect(screen.getByLabelText("banner options")).toBeTruthy();
  });

  test("below 768px the title is still the note's own head", () => {
    // The bar above the page stops printing the name for a note (PageHeader),
    // so this IS the name on screen — the wireframe "New note mobile - no
    // banner" draws exactly this row.
    render(NoteBanner, { props: props({ compact: true }) });
    expect(screen.getByText("Ideia")).toBeTruthy();
  });

  test("a colour banner is painted with the palette, never a hex", () => {
    const { container } = render(NoteBanner, {
      props: props({ banner: { kind: "color", value: "yellow" } }),
    });

    const banner = container.querySelector(".note-banner");
    expect(banner.getAttribute("style")).toContain("var(--accent-yellow-fill)");
    expect(container.querySelector(".note-banner__image")).toBeNull();
    // The title moves onto the chip over it — one title, in one place.
    expect(screen.getByText("Ideia")).toBeTruthy();
  });

  test("an image banner loads the file the address names", () => {
    const { container } = render(NoteBanner, {
      props: props({ banner: { kind: "image", value: "assets/foto.png" } }),
    });

    const img = container.querySelector(".note-banner__image");
    expect(img.getAttribute("src")).toContain("Caderno");
  });

  test("the ⋮ takes the banner off, and a read-only note has no ⋮ at all", async () => {
    const set = [];
    render(NoteBanner, {
      props: props({ banner: { kind: "color", value: "blue" }, onSet: (v) => set.push(v) }),
    });

    await userEvent.click(screen.getByLabelText("banner options"));
    await userEvent.click(screen.getByText("Remove banner"));
    expect(set).toEqual([null]);

    cleanup();
    render(NoteBanner, {
      props: props({ banner: { kind: "color", value: "blue" }, readOnly: true }),
    });
    expect(screen.queryByLabelText("banner options")).toBeNull();
  });
});
