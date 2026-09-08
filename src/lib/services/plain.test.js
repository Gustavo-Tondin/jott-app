import { describe, expect, test } from "vitest";
import { plain } from "./plain.js";

describe("plain", () => {
  test("folds case and accents", () => {
    expect(plain("Atalhos")).toBe("atalhos");
    expect(plain("Día")).toBe("dia");
    expect(plain("Configurações")).toBe("configuracoes");
  });

  test("answers an empty string for nothing", () => {
    expect(plain(null)).toBe("");
    expect(plain(undefined)).toBe("");
  });
});
