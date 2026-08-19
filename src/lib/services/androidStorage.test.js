import { describe, test, expect, vi, afterEach } from "vitest";

import {
  storageAccess,
  requestStorageAccess,
  watchStorageAccess,
} from "./androidStorage.js";

// Nobody developing Jott can click this: the bridge only exists inside the
// Android WebView, put there by MainActivity. These tests are what stands
// between a phone that can keep its notebook where the user wants it and a
// first launch stuck on a screen whose button does nothing.

afterEach(() => {
  delete window.JottAndroid;
});

describe("what Android says about file access", () => {
  test("no bridge means nothing to ask — that is every platform but Android", () => {
    expect(storageAccess()).toBe("notNeeded");
    // And asking anyway is not an error: the desktop's onboarding calls the
    // same code path before it opens the system picker.
    expect(() => requestStorageAccess()).not.toThrow();
  });

  test("the bridge's answer is passed through, both ways", () => {
    window.JottAndroid = { granted: () => true, request: vi.fn() };
    expect(storageAccess()).toBe("granted");

    window.JottAndroid = { granted: () => false, request: vi.fn() };
    expect(storageAccess()).toBe("denied");
  });

  test("a bridge that throws is treated as no bridge", () => {
    // Rather than propagating: the app then stays usable in its private
    // folder, which is worse than choosing a folder and far better than a
    // screen the user cannot get past.
    window.JottAndroid = {
      granted: () => {
        throw new Error("no such method");
      },
    };
    expect(storageAccess()).toBe("notNeeded");
  });

  test("requesting goes to the bridge, and answers nothing", () => {
    const request = vi.fn();
    window.JottAndroid = { granted: () => false, request };

    expect(requestStorageAccess()).toBeUndefined();
    expect(request).toHaveBeenCalledOnce();
  });

  test("coming back from the Settings screen is what re-asks", () => {
    // The permission is a toggle on a system screen, not a dialog with a
    // result — so the only signal that it changed is the app regaining focus,
    // which MainActivity turns into this event.
    window.JottAndroid = { granted: () => false, request: vi.fn() };
    const seen = [];
    const stop = watchStorageAccess((next) => seen.push(next));

    document.dispatchEvent(new CustomEvent("android-storage-changed"));
    window.JottAndroid = { granted: () => true, request: vi.fn() };
    document.dispatchEvent(new CustomEvent("android-storage-changed"));

    stop();
    document.dispatchEvent(new CustomEvent("android-storage-changed"));

    expect(seen).toEqual(["denied", "granted"]);
  });
});
