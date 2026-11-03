// The no-progress guard's two rules added for audit A1, cause 2: a call that
// lands on a state the build was already in is not progress, and a completion
// refused the same way over the same draft counts even after calls between.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceNoProgress } from "../no-progress.ts";

const guard = () => automationStudioLlmEvidenceNoProgress({
  max: 5,
  redirectAt: 3,
  facts: () => ({ proposableSteps: 0, completionAttempts: 0, canComplete: true }),
  show: () => {}
});

describe("the no-progress guard", () => {
  it("counts an applied call that lands on a state already visited, by any tool, as a repeat", () => {
    const progress = guard();
    const applied = (toolId: string, stateAfter: string, answer = "{\"ok\":true}") => progress.answerRepeats({ toolId, answer, mutated: true, stateAfter });
    expect(applied("go", "A")).toBe(false);
    expect(applied("go", "B")).toBe(false);
    expect(applied("go", "A")).toBe(true);
    expect(applied("press", "B")).toBe(true);
    // A state the build has not been in is new, whatever came before.
    expect(applied("go", "C")).toBe(false);
    // Visited states are not forgotten when progress clears the count.
    progress.cleared();
    expect(applied("go", "A")).toBe(true);
  });

  it("judges an applied call with no digest as before: never a repeat", () => {
    const progress = guard();
    expect(progress.answerRepeats({ toolId: "go", answer: "x", mutated: true })).toBe(false);
    expect(progress.answerRepeats({ toolId: "go", answer: "x", mutated: true })).toBe(false);
  });

  it("remembers a refusal of the same draft for the same issues across calls, and forgets it once the draft changes", () => {
    const progress = guard();
    expect(progress.refusedAgain("draft.1", "a|b")).toBe(false);
    progress.cleared();
    expect(progress.refusedAgain("draft.1", "a|b")).toBe(true);
    expect(progress.refusedAgain("draft.1", "c")).toBe(false);
    expect(progress.refusedAgain("draft.2", "a|b")).toBe(false);
    expect(progress.refusedAgain("draft.1", "a|b")).toBe(false);
  });
});
