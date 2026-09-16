import { afterEach, expect, test, vi } from "vitest";
import { centreWhenDrawn } from "./centreWhenDrawn.js";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

test("centres the element once it is drawn, a few frames later", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  centreWhenDrawn(".late");
  vi.advanceTimersToNextFrame();
  const late = document.createElement("div");
  late.className = "late";
  late.scrollIntoView = vi.fn();
  document.body.appendChild(late);
  vi.advanceTimersToNextFrame();
  vi.advanceTimersToNextFrame();
  expect(late.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(late.scrollIntoView.mock.calls[0][0].block).toBe("center");
});

test("gives up after the wait instead of looking forever", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  centreWhenDrawn(".never", { wait: 100 });
  vi.advanceTimersByTime(200);
  const never = document.createElement("div");
  never.className = "never";
  never.scrollIntoView = vi.fn();
  document.body.appendChild(never);
  vi.advanceTimersByTime(200);
  expect(never.scrollIntoView).not.toHaveBeenCalled();
});
