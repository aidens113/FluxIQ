import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../evidence-loop.ts";
import { automationStudioFlowBootstrapEvidenceLoopLimits } from "../flow-bootstrap-evidence-loop.ts";

// The Flow Bootstrap loop used to stop at `min(calls, 8)` decisions, four when
// nothing was declared. It now takes the resolution's call count, or the loop's
// own ceiling, and splits the grant's purse so every authorised call can pay.
describe("automationStudioFlowBootstrapEvidenceLoopLimits", () => {
  it("lets a default 26-call grant iterate 26 times, past the old cap of eight", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 26, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 });

    expect(limits.loop).toEqual({ minToolCalls: 1, maxIterations: 26, maxToolCalls: 27, maxEvidenceBytes: 64_000, maxEvidenceContextBytes: 8_000 });
    // Each decision reserves a twenty-sixth of $2, never the $0.25 per-call
    // cap: at $0.25 the grant would refuse the ninth decision on cost.
    expect(limits.maxEstimatedCostUsdPerCall).toBeCloseTo(2 / 26, 8);
    const rounded = (value: number) => Math.round(value * 1_000_000_000) / 1_000_000_000;
    let committed = 0;
    for (let call = 0; call < 26; call += 1) committed = rounded(committed + limits.maxEstimatedCostUsdPerCall!);
    expect(committed).toBeLessThanOrEqual(2);
  });

  it("falls back to the loop's own ceiling, not to a small default, when nothing is declared", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({});

    expect(limits.loop.maxIterations).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations);
    expect(limits.loop.maxToolCalls).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls);
    expect(limits).not.toHaveProperty("maxEstimatedCostUsdPerCall");
    for (const maxCallsPerRun of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun }).loop.maxIterations).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations);
    }
  });

  it("never configures more than the loop accepts", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 500 });

    expect(limits.loop.maxIterations).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations);
    expect(limits.loop.maxToolCalls).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls);
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 3 }).loop).toMatchObject({ maxIterations: 3, maxToolCalls: 4 });
  });

  it("keeps a per-call cost that is already the smaller of the two, and passes one through when no total is given", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 2, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 2 }).maxEstimatedCostUsdPerCall).toBe(0.1);
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 4, maxEstimatedCostUsd: 0.2 }).maxEstimatedCostUsdPerCall).toBe(0.2);
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 4, maxTotalEstimatedCostUsd: 1 }).maxEstimatedCostUsdPerCall).toBe(0.25);
  });
});
