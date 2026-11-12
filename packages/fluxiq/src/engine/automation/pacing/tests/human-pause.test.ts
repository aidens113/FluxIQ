import { describe, expect, it } from "vitest";
import { automationStudioHumanPauseMs } from "../index.ts";

const mean = (level: number, count = 2_000) => Array.from({ length: count }, (_, index) => automationStudioHumanPauseMs(level, 7, `n${index}`, 1)).reduce((sum, ms) => sum + ms, 0) / count;

describe("a human pause before a node's first arrival", () => {
  it.each([0, undefined, Number.NaN, -5])("is 0 at level %s", (level) => {
    expect(automationStudioHumanPauseMs(level, 1, "a", 1)).toBe(0);
  });
  it("is the same for the same seed, node and ordinal, and varies across nodes and ordinals", () => {
    expect(automationStudioHumanPauseMs(60, 9, "a", 1)).toBe(automationStudioHumanPauseMs(60, 9, "a", 1));
    const pauses = new Set(["a", "b", "c", "d", "e", "f"].map((id) => automationStudioHumanPauseMs(60, 9, id, 1)));
    expect(pauses.size).toBeGreaterThan(3);
    expect(automationStudioHumanPauseMs(60, 9, "a", 2)).not.toBe(automationStudioHumanPauseMs(60, 9, "a", 1));
    expect(automationStudioHumanPauseMs(60, 10, "a", 1)).not.toBe(automationStudioHumanPauseMs(60, 9, "a", 1));
  });
  it("grows with level: near nothing at 1, a mean near 1.2 s at 100, with the occasional long reading pause", () => {
    expect(mean(1)).toBeLessThan(40);
    expect(mean(25)).toBeLessThan(mean(50));
    expect(mean(50)).toBeLessThan(mean(100));
    expect(mean(100)).toBeGreaterThan(1_000);
    expect(mean(100)).toBeLessThan(1_400);
    const long = Array.from({ length: 500 }, (_, index) => automationStudioHumanPauseMs(100, 3, `n${index}`, 1)).filter((ms) => ms > 3_000).length;
    expect(long).toBeGreaterThan(0);
  });
  it("holds a developer's least step gap as a floor at every level, and changes nothing when absent", () => {
    expect(automationStudioHumanPauseMs(0, 1, "a", 1, 750)).toBe(750);
    expect(automationStudioHumanPauseMs(undefined, 1, "a", 1, 750)).toBe(750);
    expect(automationStudioHumanPauseMs(0, 1, "a", 1, undefined)).toBe(0);
    expect(automationStudioHumanPauseMs(0, 1, "a", 1, 0)).toBe(0);
    for (const id of ["a", "b", "c", "d", "e"]) {
      const free = automationStudioHumanPauseMs(40, 5, id, 1);
      expect(automationStudioHumanPauseMs(40, 5, id, 1, 300)).toBe(Math.max(300, free));
      expect(automationStudioHumanPauseMs(40, 5, id, 1, undefined)).toBe(free);
    }
  });
});
