import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { wakeLoop } from "./wakeLoop.js";

describe("wakeLoop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("fires what is due, then sleeps for as long as it is told", async () => {
    const fired = [];
    let pending = ["a"];
    const loop = wakeLoop({
      due: () => pending,
      fire: async (due) => {
        fired.push(...due);
        pending = [];
      },
      waitAfter: () => 5000,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fired).toEqual(["a"]);
    pending = ["b"];
    await vi.advanceTimersByTimeAsync(4999);
    expect(fired).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(fired).toEqual(["a", "b"]);
    loop.stop();
  });

  test("nothing due — false or an empty list — fires nothing", async () => {
    const fire = vi.fn();
    const empty = wakeLoop({ due: () => [], fire, waitAfter: () => 1000 });
    const no = wakeLoop({ due: () => false, fire, waitAfter: () => 1000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fire).not.toHaveBeenCalled();
    empty.stop();
    no.stop();
  });

  test("a rearm while firing runs one more pass after it, never a parallel one", async () => {
    let done = false;
    let fires = 0;
    let passes = 0;
    let release;
    const loop = wakeLoop({
      due: () => (passes++, !done),
      fire: async () => {
        fires += 1;
        await new Promise((resolve) => (release = resolve));
        done = true;
      },
      waitAfter: () => 60000,
    });
    await vi.advanceTimersByTimeAsync(0);
    loop.rearm();
    loop.rearm();
    expect(passes).toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(fires).toBe(1);
    expect(passes).toBe(2);
    expect(vi.getTimerCount()).toBe(1);
    loop.stop();
  });

  test("a fire that throws is reported and the next pass is still armed", async () => {
    const onError = vi.fn();
    const loop = wakeLoop({
      due: () => true,
      fire: async () => {
        throw new Error("no bell");
      },
      waitAfter: () => 1000,
      onError,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    loop.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("stop during a fire leaves no timer behind", async () => {
    let release;
    const loop = wakeLoop({
      due: () => true,
      fire: () => new Promise((resolve) => (release = resolve)),
      waitAfter: () => 1000,
    });
    await vi.advanceTimersByTimeAsync(0);
    loop.stop();
    release();
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
