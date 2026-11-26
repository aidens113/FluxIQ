import { describe, expect, it } from "vitest";
import { automationStudioFlowBootstrapUnusableDecisions } from "../unusable-decisions.ts";

const progress = { issueCodes: ["llm_output.invalid_evidence_decision"], trace: [], accounting: { iterations: 3, toolCalls: 1, evidenceBytes: 10, inputTokens: 30, outputTokens: 15, totalTokens: 45, estimatedCostUsd: 0.003 }, steps: [] };
type Stall = Parameters<ReturnType<typeof automationStudioFlowBootstrapUnusableDecisions>["stalled"]>[0];

describe("the unusable-decision options both authoring modes give their loop", () => {
  // No count of unusable decisions in a row ends a loop (t1056): the options carry the stall alone, and no bound.
  it("carries no bound on unusable decisions in a row", () => {
    const options = automationStudioFlowBootstrapUnusableDecisions({ callerEnding: () => undefined, stalled: () => new Error("stalled") });
    expect(Object.keys(options)).toEqual(["stalled"]);
  });

  it("ends a stall with the build's own ending when it has one, and with the caller's stall otherwise", () => {
    const asked = new Error("permission asked"), stall = new Error("stalled"), seen: Stall[] = [];
    let ask = true;
    const options = automationStudioFlowBootstrapUnusableDecisions({ callerEnding: (got) => { seen.push(got); return ask ? asked : undefined; }, stalled: (got) => { seen.push(got); return stall; } });
    expect(options.stalled(progress)).toBe(asked);
    ask = false;
    expect(options.stalled(progress)).toBe(stall);
    // The ending and the stall both read the loop's own progress.
    expect(seen).toEqual([progress, progress, progress]);
  });
});
