import { beforeEach, describe, expect, test } from "vitest";

import { bridge, commandsCalled, fails, invoke, resetBridge } from "../test/bridge.js";
import { isDue, autoCheck } from "./update.js";

const NOW = new Date("2026-08-19T12:00:00Z");
const newer = {
  current: "0.20.0",
  latest: "0.21.0",
  newer: true,
  canInstall: false,
  url: "https://example.com/releases",
};

/// What the bridge answers, with this test's difference on top — the whole
/// table each time, so a failure armed in one test cannot survive into the
/// next one.
const answering = (over = {}) =>
  bridge({ auto_update_check: true, last_update_check: null, check_for_update: newer, ...over });

beforeEach(() => {
  resetBridge();
  answering();
});

describe("isDue", () => {
  test("never having checked is due, and so is garbage", () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue(undefined, NOW)).toBe(true);
    expect(isDue("not a date", NOW)).toBe(true);
  });

  test("a day is the line", () => {
    expect(isDue("2026-08-19T11:00:00Z", NOW)).toBe(false);
    expect(isDue("2026-08-18T12:00:00Z", NOW)).toBe(true);
    expect(isDue("2026-08-01T00:00:00Z", NOW)).toBe(true);
  });
});

describe("autoCheck", () => {
  test("switched off means not even a look at the stamp", async () => {
    answering({ auto_update_check: false });
    expect(await autoCheck(NOW)).toBe(null);
    expect(commandsCalled()).not.toContain("check_for_update");
    expect(commandsCalled()).not.toContain("remember_last_update_check");
  });

  test("not due yet means no request", async () => {
    answering({ last_update_check: "2026-08-19T11:00:00Z" });
    expect(await autoCheck(NOW)).toBe(null);
    expect(commandsCalled()).not.toContain("check_for_update");
  });

  test("a due check stamps the attempt and reports the newer version", async () => {
    expect(await autoCheck(NOW)).toEqual(newer);
    expect(invoke).toHaveBeenCalledWith("remember_last_update_check", {
      when: NOW.toISOString(),
    });
  });

  test("being up to date is not news", async () => {
    answering({ check_for_update: { ...newer, newer: false } });
    expect(await autoCheck(NOW)).toBe(null);
  });

  test("an offline launch is a normal launch — the failure is swallowed, but the attempt still counts", async () => {
    answering({ check_for_update: fails("no network") });
    expect(await autoCheck(NOW)).toBe(null);
    // Stamped BEFORE the request: offline every morning must not become a
    // request on every launch.
    expect(invoke).toHaveBeenCalledWith("remember_last_update_check", {
      when: NOW.toISOString(),
    });
  });
});
