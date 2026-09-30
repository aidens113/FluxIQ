import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST, AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, automationStudioLlmResolutionWithinFlowSettings } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS } from "../../recovery/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS } from "../evidence-loop.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS, automationStudioFlowBootstrapEvidenceLoopLimits } from "../flow-bootstrap-evidence-loop.ts";

// A build's recorded token totals were held to one request's ceiling. They
// add up every call, so the bound is sixty-four calls at the per-request
// ceiling, written out in the module and pinned here. It was a grant's call
// cap; with grants gone it stays a plain accounting bound.
describe("the most tokens a Flow Bootstrap may record", () => {
  it("is sixty-four calls at the per-request ceiling", () => {
    expect(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS).toBe(64 * AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST);
  });
});

// Nine minutes, so the plan check, the reading of the instructions and
// persisting the proposal still finish inside ten. It was a minute inside a
// grant's ten-minute run lease; the lease is gone and the number is kept.
describe("the Flow Bootstrap deadline", () => {
  it("ends the exploration at nine minutes", () => {
    expect(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS).toBe(540_000);
  });
});

// The build used to stop at the grant's call count, 26 by default, while still
// progressing (`run-mubs2sme-75efe4a4`). It is now handed the run's own bounds.
describe("the Flow Bootstrap budget", () => {
  it("is the resolution's token budget, its per-call worst case, its cost ceiling and the deadline", () => {
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

  // Spend safety is a plain configured limit read from Flow settings
  // (`adaptationPolicySettings.maxEstimatedCostUsdPerRun`), not a grant.
  it("takes the Flow's configured cost ceiling over the resolution's default total, and splits it across the calls", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 10, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 }, 0.5);

    expect(limits.loop.budget).toMatchObject({ maxCostUsd: 0.5 });
    expect(limits.maxEstimatedCostUsdPerCall).toBeCloseTo(0.05, 9);
  });

  // `run-munnq7vz-98c3481c`: the Lab saved `maxCalls: 48`, the host's resolver
  // declared no count, and the build ran to the loop's 64. The Flow's count,
  // read into the resolution, is the loop's backstop.
  it("stops a Flow configured for 48 calls at 48 decisions under the host's resolver defaults", () => {
    const provider = { metadata: { provider: "mock", model: "mock" }, runTask: async () => ({}) };
    const resolution = automationStudioLlmResolutionWithinFlowSettings({ provider, ...AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, tokenLimits: { ...AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.tokenLimits } }, {
      llmExecutionSettings: { tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxCalls: 48, timeoutMs: 25_000, maxEstimatedCostUsd: 0.25, retryCount: 0 }
    });

    const limits = automationStudioFlowBootstrapEvidenceLoopLimits(resolution);
    expect(limits.loop.maxIterations).toBe(48);
    expect(limits.loop.maxToolCalls).toBe(49);
  });

  it("keeps the resolution's default total when the Flow sets no usable ceiling", () => {
    for (const unset of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 10, maxTotalEstimatedCostUsd: 2 }, unset).loop.budget).toMatchObject({ maxCostUsd: 2 });
    }
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
// own ceiling, and splits the run's purse so every call it allows can pay.
describe("automationStudioFlowBootstrapEvidenceLoopLimits", () => {
  it("lets a 26-call resolution iterate 26 times, past the old cap of eight", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 26, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 });

    expect(limits.loop).toEqual({ minToolCalls: 1, maxIterations: 26, maxToolCalls: 27, maxEvidenceBytes: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes, maxEvidenceContextBytes: 24_000, budget: { maxCostUsd: 2, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS } });
    // Each decision reserves a twenty-sixth of $2, never the $0.25 per-call
    // cap: at $0.25 the purse would refuse the ninth decision on cost.
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
