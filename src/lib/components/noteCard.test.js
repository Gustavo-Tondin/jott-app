// The card's last line (NoteCard.svelte): when the note was last OPENED.
//
// A note ages by being read, not by being written (spec 3.6b), so the stamp
// says which of the two it is showing — the eye for a reading, the clock for
// a note nobody in this app has ever opened.
import { render } from "@testing-library/svelte";
import { describe, expect, test } from "vitest";
import NoteCard from "./NoteCard.svelte";

const card = (entry = {}, props = {}) =>
  render(NoteCard, {
    props: {
      entry: {
        path: "Inbox/Ideia.md",
        title: "Ideia",
        folder: "Inbox",
        preview: "um texto",
        created: "2026-08-16",
        pinned: false,
        tags: [],
        banner: null,
        seen: null,
        age: null,
        ...entry,
      },
      onOpen: () => {},
      ...props,
    },
  });

describe("NoteCard — last opened", () => {
  test("a note opened three days ago wears the eye", () => {
    const { container } = card({
      seen: "2026-08-25T18:40:00",
      age: { days: 3, band: "fresh" },
    });
    const stamp = container.querySelector(".note-card__age");
    expect(stamp.textContent.trim()).toBe("3d");
    expect(stamp.getAttribute("title")).toBe("Last opened 08/25/2026");
    expect(stamp.querySelector(".theme-icon svg")).not.toBe(null);
  });

  test("a note nobody ever opened counts from its birth", () => {
    const { container } = card({ age: { days: 40, band: "forgotten" } });
    const stamp = container.querySelector(".note-card__age");
    expect(stamp.textContent.trim()).toBe("40d");
    expect(stamp.getAttribute("title")).toBe("Created 08/16/2026");
    expect(stamp.classList.contains("note-card__age--forgotten")).toBe(true);
  });

  test("the switch takes the whole line away, tags and all", () => {
    const { container } = card(
      { age: { days: 3, band: "fresh" } },
      { showAge: false },
    );
    expect(container.querySelector(".note-card__age")).toBe(null);
    expect(container.querySelector(".note-card__meta")).toBe(null);
  });

  test("tags and the stamp share one row", () => {
    const { container } = card({
      tags: ["ideias"],
      seen: "2026-08-25T18:40:00",
      age: { days: 3, band: "fresh" },
    });
    const meta = container.querySelector(".note-card__meta");
    expect(meta.querySelector(".note-card__tags")).not.toBe(null);
    expect(meta.querySelector(".note-card__age")).not.toBe(null);
  });

  test("a small card — the one inside a folder — carries no stamp", () => {
    const { container } = card(
      { seen: "2026-08-25T18:40:00", age: { days: 3, band: "fresh" } },
      { small: true },
    );
    expect(container.querySelector(".note-card__age")).toBe(null);
  });
});
