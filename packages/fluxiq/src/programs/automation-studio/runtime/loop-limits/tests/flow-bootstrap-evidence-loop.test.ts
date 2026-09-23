import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST, AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS, AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS } from "../../recovery/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS } from "../evidence-loop.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS, automationStudioFlowBootstrapEvidenceLoopLimits } from "../flow-bootstrap-evidence-loop.ts";

// A build's recorded token totals were held to one request's ceiling. They
// add up every call, so the bound is the largest whole-run token budget a grant
// accepts -- its call backstop at the per-request ceiling -- which is written
// out in the module and pinned to the grant's own numbers here.
describe("the most tokens a Flow Bootstrap may record", () => {
  it("is the largest run token budget a grant accepts", () => {
    expect(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS).toBe(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS * AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST);
  });
});

// The build's clock ends inside the grant's run lease, which refuses any call
// after it, so the exploration's deadline is what ends it and says so.
describe("the Flow Bootstrap deadline", () => {
  it("ends the exploration a minute inside the grant's run lease", () => {
    expect(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS).toBe(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_RUN_MS - 60_000);
  });
});

// The build used to stop at the grant's call count, 26 by default, while still
// progressing (`run-mubs2sme-75efe4a4`). It is now handed the run's own bounds.
describe("the Flow Bootstrap budget", () => {
  it("is the grant's token budget, its per-call worst case, its cost ceiling and the deadline", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({
      maxCallsPerRun: 64, maxTotalTokensPerRun: 600_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2,
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }
    });

    expect(limits.loop.budget).toEqual({ maxTotalTokens: 600_000, maxTokensPerDecision: 56_000, maxCostUsd: 2, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS });
    expect(limits.loop.maxIterations).toBe(64);
  });

  it("names only the bounds the resolution declared, and keeps a cost ceiling under a dollar", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({}).loop.budget).toEqual({ maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS });
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: 0.5 }).loop.budget).toMatchObject({ maxCostUsd: 0.5 });
  });
});

// Creation gives up on bad replies after exactly as many in a row as a runtime
// recovery's exploration does. The number is held here because runtime/llm/
// may not read it from runtime/recovery/; this is what keeps the two equal.
describe("the unusable-decision streak", () => {
  it("is the runtime exploration's no-progress streak", () => {
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS).toBe(AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
    // No longer the runtime exploration's streak of three. Three ended builds
    // that were working: a setback, a look, and another way is two steps that
    // gathered nothing new and exactly the right thing to do. What bounds a
    // build is its cost, its tokens and its deadline; this is the far backstop.
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 26 }).maxConsecutiveUnusableDecisions).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS);
  });

  it("never exceeds what the loop may spend, so the loop accepts it", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 2 }).maxConsecutiveUnusableDecisions).toBe(2);
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 1 }).maxConsecutiveUnusableDecisions).toBe(1);
  });
});

// The Flow Bootstrap loop used to stop at `min(calls, 8)` decisions, four when
// nothing was declared. It now takes the resolution's call count, or the loop's
// own ceiling, and splits the grant's purse so every authorised call can pay.
describe("automationStudioFlowBootstrapEvidenceLoopLimits", () => {
  it("lets a default 26-call grant iterate 26 times, past the old cap of eight", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 26, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 });

    expect(limits.loop).toEqual({ minToolCalls: 1, maxIterations: 26, maxToolCalls: 27, maxEvidenceBytes: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes, maxEvidenceContextBytes: 24_000, budget: { maxCostUsd: 2, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS } });
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

  // The total was 64,000 bytes, and realistic builds reached it in ten to
  // fifteen calls (`run-mubpn1ga-8ae8fdc5`: 63,982 bytes, fourteen calls). It is
  // now only a backstop: a build carrying a 20 KB page on every one of its
  // calls, the largest measured, still ends on its calls before it.
  it("holds the total only to a backstop no measured build reaches before its calls", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 26 });
    const largestMeasuredPage = 20_000;

    expect(limits.loop.maxEvidenceBytes).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes);
    expect(limits.loop.maxToolCalls * largestMeasuredPage).toBeLessThan(limits.loop.maxEvidenceBytes);
    expect(limits.loop.maxEvidenceContextBytes).toBeLessThan(limits.loop.maxEvidenceBytes);
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
