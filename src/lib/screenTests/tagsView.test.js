// The Tags screen — every #word in use with its count, the catalogue's
// colours, a filter once the list is long.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { bridge, invoke } from "../test/bridge.js";
import { noop, resetScreens } from "../test/screens.js";
import TagsView from "../screens/TagsView.svelte";

beforeEach(resetScreens);

describe("TagsView", () => {
  const props = (extra = {}) => ({ tags: [], onChanged: noop, onError: noop, reloadKey: 0, ...extra });

  test("a word typed into a task is a row too, with its count and no colour", async () => {
    bridge({ tag_usage: [{ name: "obra", count: 2 }, { name: "casa", count: 1 }] });
    render(TagsView, { props: props({ tags: [{ name: "obra", color: "blue" }] }) });
    expect(await screen.findByText("2 tasks")).toBeTruthy();
    expect(screen.getByText("1 task")).toBeTruthy();
    // The uncatalogued one says so, and has no bin — nothing to forget.
    expect(screen.getByText("· no colour yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Delete tag" })).toHaveLength(1);
  });

  test("a coloured tag no task carries is still listed, as not in use", async () => {
    bridge({ tag_usage: [] });
    render(TagsView, { props: props({ tags: [{ name: "velha", color: null }] }) });
    expect(await screen.findByText("not in use")).toBeTruthy();
  });

  test("with nothing at all it says so, and offers the way in", async () => {
    bridge({ tag_usage: [] });
    render(TagsView, { props: props() });
    expect(await screen.findByText("No tags yet. Add one from a task.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "New tag name" }).length).toBeGreaterThan(1);
  });

  test("the filter appears once there are many, and narrows by name", async () => {
    const usage = Array.from({ length: 9 }, (_, i) => ({ name: `tag${i}`, count: 1 }));
    bridge({ tag_usage: usage });
    render(TagsView, { props: props() });
    const field = await screen.findByRole("searchbox", { name: "Filter tags" });
    await userEvent.type(field, "tag7");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    await userEvent.clear(field);
    await userEvent.type(field, "zzz");
    expect(await screen.findByText("No tag matches that.")).toBeTruthy();
  });

  test("the glass asks the shell to search the tag", async () => {
    bridge({ tag_usage: [{ name: "obra", count: 1 }] });
    const searched = [];
    render(TagsView, { props: props({ onSearch: (n) => searched.push(n) }) });
    await userEvent.click(await screen.findByRole("button", { name: "Search #obra" }));
    expect(searched).toEqual(["obra"]);
    expect(invoke).toHaveBeenCalledWith("tag_usage");
  });
});
