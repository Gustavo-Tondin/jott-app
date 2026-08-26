// The head of a note — a colour or an image.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { cleanup, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
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

  test("a colour banner is painted with the palette, never a hex", async () => {
    const { container } = render(NoteBanner, {
      props: props({ banner: { kind: "color", value: "yellow" } }),
    });

    const banner = container.querySelector(".note-banner");
    expect(banner.getAttribute("style")).toContain("var(--app-yellow-fill)");
    // And the picker's swatch shows THAT step, not the region's base: the
    // colour chosen is the colour received (2026-08-26).
    await userEvent.click(screen.getByLabelText("banner options"));
    expect(screen.getByRole("button", { name: "yellow" }).getAttribute("style")).toContain(
      "--dot: var(--app-yellow-fill)",
    );
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

  test("the properties line: created and the tags, picked from the catalogue", async () => {
    // Obsidian's layout (2026-08-26): a quiet name column, the value beside
    // it. The tags are neutral badges — a tag is a subject; the one colour a
    // note wears is its space's — and the picker offers the task catalogue.
    const set = vi.fn();
    render(NoteBanner, {
      props: props({
        created: "2026-08-20",
        tags: ["briefing"],
        catalogue: [{ name: "briefing" }, { name: "cliente" }],
        dateFormat: "dd/mm/yyyy",
        onSetTags: set,
      }),
    });
    expect(screen.getByText("20/08/2026")).toBeTruthy();
    const badge = screen.getByText(/#briefing/);
    expect(badge.className).toContain("theme-badge");
    expect(badge.getAttribute("style")).toBeNull();

    // Removing sends the whole list back, without the one.
    await userEvent.click(screen.getByLabelText("remove #briefing"));
    expect(set).toHaveBeenLastCalledWith([]);

    // Picking: the catalogue minus what is applied.
    await userEvent.click(screen.getByRole("button", { name: "add tag" }));
    expect(screen.queryByText("#briefing", { selector: ".tag-picker__option .theme-badge" })).toBeNull();
    await userEvent.click(screen.getByText("#cliente"));
    expect(set).toHaveBeenLastCalledWith(["briefing", "cliente"]);
  });

  test("the properties are below the block, never on it", async () => {
    // A banner can be any photograph at all, and no ink colour reads against
    // every picture someone might pick (user call, 2026-08-26). So the
    // properties live outside the block, on the canvas's own ground — and
    // land in the same place whether the note has a banner or not.
    const { container } = render(NoteBanner, {
      props: props({
        banner: { kind: "image", value: "assets/foto.png" },
        created: "2026-08-20",
        tags: ["briefing"],
        onSetTags: noop,
      }),
    });

    const block = container.querySelector(".note-banner__block");
    const props_ = container.querySelector(".note-banner__props");
    expect(block).toBeTruthy();
    expect(props_).toBeTruthy();
    expect(block.contains(props_)).toBe(false);
    // And the image — the thing with no readable contrast — IS in the block.
    expect(block.querySelector(".note-banner__image")).toBeTruthy();
    // Same column as the title, so the two line up: both are a `__line`.
    expect(props_.closest(".note-banner__line")).toBeTruthy();
  });

  test("with note tags off the line is not drawn, and read-only draws no picker", () => {
    render(NoteBanner, { props: props({ created: "2026-08-20", tags: ["x"], tagsEnabled: false }) });
    expect(screen.queryByText("20/08/2026")).toBeNull();
    cleanup();
    render(NoteBanner, { props: props({ tags: ["x"], readOnly: true, onSetTags: noop }) });
    expect(screen.getByText(/#x/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "add tag" })).toBeNull();
  });
});
