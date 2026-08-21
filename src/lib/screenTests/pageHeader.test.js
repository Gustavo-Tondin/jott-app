// The header of a page.
//
// Screen tests with the bridge mocked. What they catch, what they deliberately
// do not, and the fakes they share: `lib/test/screens.js`.

import { render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { noop, resetScreens } from "../test/screens.js";
import PageHeader from "../shell/PageHeader.svelte";

beforeEach(resetScreens);

describe("PageHeader", () => {
  const props = (extra = {}) => ({
    title: "Compras",
    subtitle: "",
    canBack: false,
    canForward: false,
    onBack: noop,
    onForward: noop,
    menu: [{ label: "rename list", run: noop }],
    ...extra,
  });

  test("the menu closes when the page changes", async () => {
    // A menu left hanging over a screen the user has already left would act
    // on the wrong thing.
    const { rerender } = render(PageHeader, { props: props() });

    await userEvent.click(screen.getByLabelText("page menu"));
    expect(await screen.findByText("rename list")).toBeTruthy();

    await rerender(props({ title: "Mercado" }));
    await waitFor(() => expect(screen.queryByText("rename list")).toBeNull());
  });

  test("picking an item runs it and closes the menu", async () => {
    let ran = 0;
    render(PageHeader, { props: props({ menu: [{ label: "go", run: () => ran++ }] }) });

    await userEvent.click(screen.getByLabelText("page menu"));
    await userEvent.click(await screen.findByText("go"));

    expect(ran).toBe(1);
    expect(screen.queryByText("go")).toBeNull();
  });

  test("the title renames the document when it can be renamed", async () => {
    let renamed = 0;
    render(PageHeader, { props: props({ onRenameTitle: () => renamed++ }) });

    await userEvent.click(screen.getByRole("button", { name: /Compras/ }));
    expect(renamed).toBe(1);
  });

  test("a title with no rename is plain text, not a button", async () => {
    render(PageHeader, { props: props() });
    expect(screen.queryByRole("button", { name: /Compras/ })).toBeNull();
  });
});
