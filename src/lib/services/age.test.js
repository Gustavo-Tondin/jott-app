// The age stamp as a card draws it (services/age.js).
import { describe, expect, test } from "vitest";
import { ABSOLUTE_AFTER, ageStamp, noteSince } from "./age.js";
import { S } from "./strings.js";

describe("ageStamp", () => {
  test("a young thing is a number of days", () => {
    const stamp = ageStamp({ days: 12, band: "stale" }, { since: "2026-08-16" });
    expect(stamp.text).toBe("12d");
    expect(stamp.band).toBe("stale");
  });

  test("today says so in words rather than as a zero", () => {
    expect(ageStamp({ days: 0, band: "fresh" }, { since: "2026-08-28" }).text).toBe("today");
  });

  test("past sixty days the number gives way to the date", () => {
    // The number stops meaning anything a reader can use — spec 3.6b.
    const at = ageStamp({ days: ABSOLUTE_AFTER, band: "forgotten" }, { since: "2026-06-29" });
    expect(at.text).toBe(`${ABSOLUTE_AFTER}d`);
    const past = ageStamp(
      { days: ABSOLUTE_AFTER + 1, band: "forgotten" },
      { since: "2026-06-28", dateFormat: "dd/mm/yyyy" },
    );
    expect(past.text).toBe("28/06/2026");
  });

  test("no date to fall back on keeps the number, however old", () => {
    // Never a blank stamp: the age is known even when the day it counts from
    // is not, and an empty pill on the card would read as a bug.
    expect(ageStamp({ days: 400, band: "forgotten" }, {}).text).toBe("400d");
  });

  test("nothing stamped draws nothing", () => {
    expect(ageStamp(null, { since: "2026-08-16" })).toBe(null);
    expect(ageStamp(undefined, {})).toBe(null);
    expect(ageStamp({}, {})).toBe(null);
  });

  test("the tooltip spells out what the number is short for", () => {
    const stamp = ageStamp(
      { days: 3, band: "fresh" },
      { since: "2026-08-25", title: S.lastSeenOn },
    );
    expect(stamp.title).toBe("Last opened 08/25/2026");
  });
});

describe("noteSince", () => {
  test("the day it was last opened, when it ever was", () => {
    expect(noteSince({ seen: "2026-08-25T18:40:00", created: "2026-01-02" })).toBe("2026-08-25");
  });

  test("its birthday, when nobody ever opened it", () => {
    expect(noteSince({ seen: null, created: "2026-01-02" })).toBe("2026-01-02");
  });

  test("nothing at all is nothing to show", () => {
    expect(noteSince({})).toBe(null);
    expect(noteSince(null)).toBe(null);
  });
});
