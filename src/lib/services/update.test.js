import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./api.js", () => ({
  api: {
    autoUpdateCheck: vi.fn(),
    lastUpdateCheck: vi.fn(),
    rememberLastUpdateCheck: vi.fn(() => Promise.resolve()),
    checkForUpdate: vi.fn(),
  },
}));

const { api } = await import("./api.js");
const { isDue, autoCheck } = await import("./update.js");

const NOW = new Date("2026-08-19T12:00:00Z");
const newer = {
  current: "0.20.0",
  latest: "0.21.0",
  newer: true,
  canInstall: false,
  url: "https://example.com/releases",
};

beforeEach(() => {
  vi.clearAllMocks();
  api.autoUpdateCheck.mockResolvedValue(true);
  api.lastUpdateCheck.mockResolvedValue(null);
  api.checkForUpdate.mockResolvedValue(newer);
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
    api.autoUpdateCheck.mockResolvedValue(false);
    expect(await autoCheck(NOW)).toBe(null);
    expect(api.checkForUpdate).not.toHaveBeenCalled();
    expect(api.rememberLastUpdateCheck).not.toHaveBeenCalled();
  });

  test("not due yet means no request", async () => {
    api.lastUpdateCheck.mockResolvedValue("2026-08-19T11:00:00Z");
    expect(await autoCheck(NOW)).toBe(null);
    expect(api.checkForUpdate).not.toHaveBeenCalled();
  });

  test("a due check stamps the attempt and reports the newer version", async () => {
    expect(await autoCheck(NOW)).toEqual(newer);
    expect(api.rememberLastUpdateCheck).toHaveBeenCalledWith(NOW.toISOString());
  });

  test("being up to date is not news", async () => {
    api.checkForUpdate.mockResolvedValue({ ...newer, newer: false });
    expect(await autoCheck(NOW)).toBe(null);
  });

  test("an offline launch is a normal launch — the failure is swallowed, but the attempt still counts", async () => {
    api.checkForUpdate.mockRejectedValue(new Error("no network"));
    expect(await autoCheck(NOW)).toBe(null);
    // Stamped BEFORE the request: offline every morning must not become a
    // request on every launch.
    expect(api.rememberLastUpdateCheck).toHaveBeenCalledWith(NOW.toISOString());
  });
});
