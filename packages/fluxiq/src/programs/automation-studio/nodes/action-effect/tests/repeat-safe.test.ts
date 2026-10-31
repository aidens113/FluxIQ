import { describe, expect, it } from "vitest";
import { automationStudioResolvedActionEffectRepeatSafe } from "../index.ts";

describe("the shared resolved repeat-safety classifier", () => {
  it.each([
    { effect: { effectClass: "observe" as const, permissionConsequences: [] }, safe: true },
    { effect: { effectClass: "state" as const, permissionConsequences: [], repeatSafe: true as const }, safe: true },
    { effect: { effectClass: "state" as const, permissionConsequences: [] }, safe: false },
    { effect: { effectClass: "commit" as const, permissionConsequences: [] }, safe: false },
    { effect: { effectClass: "observe" as const, permissionConsequences: ["delete" as const] }, safe: false }
  ])("classifies only the trusted resolved contract %#", ({ effect, safe }) => {
    expect(automationStudioResolvedActionEffectRepeatSafe(effect)).toBe(safe);
  });

  it("does not turn an unreadable floor into safe absence", () => {
    expect(() => automationStudioResolvedActionEffectRepeatSafe({ effectClass: "commit", permissionConsequences: [], repeatSafe: true })).toThrow();
  });
});
