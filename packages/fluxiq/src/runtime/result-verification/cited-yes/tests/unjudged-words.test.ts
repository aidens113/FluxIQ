import { describe, expect, it } from "vitest";
import { automationStudioResultYesSaysUnjudged } from "../unjudged-words.ts";

describe("a yes whose own words say it could not judge (t875)", () => {
  it("is found in its reading or its summary", () => {
    expect(automationStudioResultYesSaysUnjudged({ summaryText: "The table itself is not shown and cannot be judged." })).toBe(true);
    expect(automationStudioResultYesSaysUnjudged({ observed: "Whether every piece is here could not be verified." })).toBe(true);
    expect(automationStudioResultYesSaysUnjudged({ changed: "It is impossible to tell whether the hold landed." })).toBe(true);
    expect(automationStudioResultYesSaysUnjudged({ observed: "There is no way to confirm the count." })).toBe(true);
  });

  it("is not found in an honest yes, which may say what can no longer be seen", () => {
    expect(automationStudioResultYesSaysUnjudged({ observed: "The removed piece cannot be seen on the shelf any more.", changed: "One hold was cancelled.", summaryText: "Both pieces are held, as asked." })).toBe(false);
    expect(automationStudioResultYesSaysUnjudged({})).toBe(false);
  });
});
