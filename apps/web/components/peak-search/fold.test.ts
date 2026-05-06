import { describe, expect, it } from "vitest";
import { fold } from "./fold";

describe("fold", () => {
  it("lowercases ASCII", () => {
    expect(fold("Rysy")).toBe("rysy");
    expect(fold("KOZI WIERCH")).toBe("kozi wierch");
  });

  it("strips Polish combining-mark accents (NFD-decomposable)", () => {
    expect(fold("Różanki")).toBe("rozanki");
    expect(fold("Świnica")).toBe("swinica");
    expect(fold("Mięguszowiecki")).toBe("mieguszowiecki");
    expect(fold("Żabia")).toBe("zabia");
    expect(fold("Ćwilin")).toBe("cwilin");
    expect(fold("Ńdza")).toBe("ndza");
  });

  it("folds ł and Ł explicitly (don't NFD-decompose)", () => {
    expect(fold("Łomnica")).toBe("lomnica");
    expect(fold("Mały Lodowy")).toBe("maly lodowy");
  });

  it("makes substring matching diacritic-insensitive in both directions", () => {
    expect(fold("Łomnica").includes(fold("lomnica"))).toBe(true);
    expect(fold("Różanki").includes(fold("rozan"))).toBe(true);
    expect(fold("Łomnica").includes(fold("ŁOM"))).toBe(true);
  });

  it("preserves whitespace and other punctuation", () => {
    expect(fold("Mały Lodowy Szczyt")).toBe("maly lodowy szczyt");
    expect(fold("Bula pod Rysami")).toBe("bula pod rysami");
  });

  it("handles empty string", () => {
    expect(fold("")).toBe("");
  });
});
