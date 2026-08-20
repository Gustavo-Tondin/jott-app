import { afterEach, describe, expect, it } from "vitest";
import { portal } from "./portal.js";

afterEach(() => (document.body.innerHTML = ""));

describe("portal", () => {
  it("takes the node out to the body", () => {
    document.body.innerHTML = `<div class="trap"><div class="panel"></div></div>`;
    const node = document.querySelector(".panel");

    portal(node);

    expect(node.parentElement).toBe(document.body);
    expect(document.querySelector(".trap").children.length).toBe(0);
  });

  // <body> is in no region, and the colour roles are inherited — a menu
  // dropped there without this comes back with no ground and no ink.
  it("carries the region it was opened in", () => {
    document.body.innerHTML = `<div data-region="chrome"><div class="panel"></div></div>`;
    const node = document.querySelector(".panel");

    portal(node);

    expect(node.dataset.region).toBe("chrome");
  });

  it("leaves a region it was told to wear alone", () => {
    document.body.innerHTML = `<div data-region="chrome"><div class="panel" data-region="canvas"></div></div>`;
    const node = document.querySelector(".panel");

    portal(node);

    expect(node.dataset.region).toBe("canvas");
  });

  it("says nothing when there is no region to carry", () => {
    document.body.innerHTML = `<div><div class="panel"></div></div>`;
    const node = document.querySelector(".panel");

    portal(node);

    expect(node.dataset.region).toBeUndefined();
  });

  it("leaves on destroy", () => {
    document.body.innerHTML = `<div class="trap"><div class="panel"></div></div>`;
    const node = document.querySelector(".panel");

    portal(node).destroy();

    expect(document.querySelector(".panel")).toBe(null);
  });
});
