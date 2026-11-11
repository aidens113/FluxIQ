import { describe, expect, it } from "vitest";
import { normalizeHumanness } from "../index.ts";

describe("normalizeHumanness", () => {
  it("rounds and clamps a finite number", () => {
    expect(normalizeHumanness(49.6)).toBe(50);
    expect(normalizeHumanness(-5)).toBe(0);
    expect(normalizeHumanness(250)).toBe(100);
    expect(normalizeHumanness(70)).toBe(70);
  });
  it("defaults on anything else", () => {
    for (const bad of [Number.NaN, Infinity, "50", undefined, null, {}]) expect(normalizeHumanness(bad), String(bad)).toBe(0);
  });
});
