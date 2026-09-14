import { describe, expect, test, beforeEach } from "vitest";
import { announce, setLiveRegion } from "./announce.js";

describe("announce", () => {
  let region;

  beforeEach(() => {
    document.body.innerHTML = "";
    region = document.createElement("div");
    document.body.append(region);
    setLiveRegion(region);
  });

  test("what is said lands in the region", () => {
    announce("Wash the car moved to position 2 of 5");
    expect(region.textContent).toBe("Wash the car moved to position 2 of 5");
  });

  test("the same words twice are still a change, so they are read twice", () => {
    announce("Moved up");
    announce("Moved up");
    expect(region.textContent).not.toBe("Moved up");
    expect(region.textContent.trim()).toBe("Moved up");
    announce("Moved up");
    expect(region.textContent).toBe("Moved up");
  });

  test("with no region registered, saying something is not an error", () => {
    setLiveRegion(null);
    expect(() => announce("nobody is listening")).not.toThrow();
  });

  test("nothing to say is not said", () => {
    announce("Something");
    announce("");
    expect(region.textContent).toBe("Something");
  });
});
