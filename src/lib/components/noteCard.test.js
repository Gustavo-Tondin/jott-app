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
  test("a note opened three days ago says so, and the tooltip says which date", () => {
    const { container } = card({
      seen: "2026-08-25T18:40:00",
      age: { days: 3, band: "fresh" },
    });
    const stamp = container.querySelector(".note-card__age");
    expect(stamp.textContent.trim()).toBe("3d");
    expect(stamp.getAttribute("title")).toBe("Last opened 08/25/2026");
    // The number alone: whether it counts from a reading or a birth is the
    // tooltip's to say.
    expect(stamp.querySelector(".theme-icon")).toBe(null);
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

  test("the foot says where the note came from and how old it is, never its tags", () => {
    const { container } = card(
      {
        tags: ["ideias"],
        seen: "2026-08-25T18:40:00",
        age: { days: 3, band: "fresh" },
      },
      { origin: { label: "Personal/Journal", color: "4" } },
    );
    const meta = container.querySelector(".note-card__meta");
    expect(meta.querySelector(".note-card__origin").textContent.trim()).toBe("Journal");
    expect(meta.querySelector(".note-card__origin").getAttribute("title")).toBe("Personal/Journal");
    expect(meta.querySelector(".theme-dot").getAttribute("style")).toBe("--dot: var(--app-4);");
    expect(meta.querySelector(".note-card__age")).not.toBe(null);
    expect(container.querySelector(".theme-badge")).toBe(null);
  });

  test("a small card — the one inside a folder — carries no stamp", () => {
    const { container } = card(
      { seen: "2026-08-25T18:40:00", age: { days: 3, band: "fresh" } },
      { small: true },
    );
    expect(container.querySelector(".note-card__age")).toBe(null);
  });
});

describe("NoteCard — a note nobody named", () => {
  test("the app's own name is not drawn: the text speaks for the card", () => {
    const { container } = card({ title: "New note", path: "Inbox/New note.md" });
    expect(container.querySelector(".note-card__title")).toBe(null);
    expect(container.querySelector(".note-preview").textContent).toContain("um texto");
  });

  test("the second one filed under the same name goes untitled too", () => {
    const { container } = card({ title: "New note 2", path: "Inbox/New note 2.md" });
    expect(container.querySelector(".note-card__title")).toBe(null);
  });

  test("a title the user chose is drawn, numbered or not", () => {
    expect(card().container.querySelector(".note-card__title").textContent.trim()).toBe("Ideia");
    expect(
      card({ title: "New notebook" }).container.querySelector(".note-card__title"),
    ).not.toBe(null);
  });

  test("with no name, the text keeps clear of the corner tools", () => {
    // `note-card--bare`: no name, so the first block of the preview is what
    // shares its line with the ⋮ (styles/components/note-card.css).
    const bare = card({ title: "New note" }).container.querySelector(".note-card");
    expect(bare.classList.contains("note-card--bare")).toBe(true);
    // The tools stand UNDER a banner, so a banner changes nothing.
    const bannered = card({
      title: "New note",
      banner: { kind: "color", value: "yellow" },
    }).container.querySelector(".note-card");
    expect(bannered.classList.contains("note-card--bare")).toBe(true);
    expect(bannered.classList.contains("note-card--banner")).toBe(true);
    expect(card().container.querySelector(".note-card--bare")).toBe(null);
  });

  test("the small card keeps its title — it is all it has", () => {
    const { container } = card({ title: "New note" }, { small: true });
    expect(container.querySelector(".note-card__title").textContent.trim()).toBe("New note");
  });
});

describe("NoteCard — the name, drawn once", () => {
  test("a note that opens with its own name as a heading draws it once", () => {
    const { container } = card({ title: "Ideia", preview: "# Ideia\n\no corpo" });
    expect(container.querySelector(".note-card__title").textContent.trim()).toBe("Ideia");
    expect(container.querySelector(".note-preview__heading")).toBe(null);
    expect(container.querySelector(".note-preview").textContent).toContain("o corpo");
  });

  test("a card drawing no name of its own keeps the heading — it is the only one", () => {
    const { container } = card({ title: "New note", preview: "# Ideia\n\no corpo" });
    expect(container.querySelector(".note-card__title")).toBe(null);
    expect(container.querySelector(".note-preview__heading").textContent.trim()).toBe("Ideia");
  });
});
