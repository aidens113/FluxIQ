import { describe, expect, it } from "vitest";
import { automationStudioFlowBootstrapUnusableDecisions } from "../unusable-decisions.ts";

const progress = { issueCodes: ["llm_output.invalid_evidence_decision"], trace: [], accounting: { iterations: 3, toolCalls: 1, evidenceBytes: 10, inputTokens: 30, outputTokens: 15, totalTokens: 45, estimatedCostUsd: 0.003 }, steps: [] };
type Stall = Parameters<ReturnType<typeof automationStudioFlowBootstrapUnusableDecisions>["stalled"]>[0];

describe("the unusable-decision options both authoring modes give their loop", () => {
  it("holds the build's guard to the loop's decision backstop, or uses it alone without one", () => {
    const base = { callerEnding: () => undefined, stalled: () => new Error("stalled") };
    expect(automationStudioFlowBootstrapUnusableDecisions({ ...base, maxConsecutiveUnusableDecisions: 8, maxIterations: 12 }).maxConsecutive).toBe(8);
    expect(automationStudioFlowBootstrapUnusableDecisions({ ...base, maxConsecutiveUnusableDecisions: 8, maxIterations: 5 }).maxConsecutive).toBe(5);
    expect(automationStudioFlowBootstrapUnusableDecisions({ ...base, maxConsecutiveUnusableDecisions: 8 }).maxConsecutive).toBe(8);
  });

  it("ends a stall with the build's own ending when it has one, and with the caller's stall otherwise", () => {
    const asked = new Error("permission asked"), stall = new Error("stalled"), seen: Stall[] = [];
    let ask = true;
    const options = automationStudioFlowBootstrapUnusableDecisions({ maxConsecutiveUnusableDecisions: 8, callerEnding: (got) => { seen.push(got); return ask ? asked : undefined; }, stalled: (got) => { seen.push(got); return stall; } });
    expect(options.stalled(progress)).toBe(asked);
    ask = false;
    expect(options.stalled(progress)).toBe(stall);
    // The ending and the stall both read the loop's own progress.
    expect(seen).toEqual([progress, progress, progress]);
  });
});
