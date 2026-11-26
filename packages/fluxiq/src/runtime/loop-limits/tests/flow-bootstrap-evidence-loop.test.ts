import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS, AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST, AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, automationStudioLlmResolutionWithinFlowSettings, type AutomationStudioLlmProviderResolution } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS, automationStudioFlowBootstrapEvidenceLoopLimits } from "../flow-bootstrap-evidence-loop.ts";

const CEILING = AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;

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
      maxTotalTokensPerRun: 600_000, maxTotalEstimatedCostUsd: CEILING * 0.8,
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }
    });

    expect(limits.loop.budget).toEqual({ maxTotalTokens: 600_000, maxTokensPerDecision: 56_000, maxCostUsd: CEILING * 0.8, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS });
  });

  it("uses the ordinary default only when no total is specified", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({}).loop.budget).toEqual({ maxCostUsd: CEILING, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS });
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: 0.5 }).loop.budget).toMatchObject({ maxCostUsd: 0.5 });
  });

  // Spend safety is a plain configured limit read from Flow settings
  // (`adaptationPolicySettings.maxEstimatedCostUsdPerRun`), not a grant, and it
  // can only lower the ceiling.
  it("takes the smaller of the resolution total and explicit Flow limit", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: 2 }, 0.5).loop.budget).toMatchObject({ maxCostUsd: 0.5 });
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: CEILING * 0.8 }, CEILING * 0.6).loop.budget).toMatchObject({ maxCostUsd: CEILING * 0.6 });
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: CEILING * 0.48 }, CEILING * 0.6).loop.budget).toMatchObject({ maxCostUsd: CEILING * 0.48 });
  });

  it("keeps an explicit resolver limit when the Flow sets no usable limit", () => {
    for (const unset of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: 2 }, unset).loop.budget).toMatchObject({ maxCostUsd: 2 });
    }
  });
});

// **No count of calls bounds a build (t1056).** A resolution's `maxCallsPerRun`, or a Flow's configured call count read
// into it, was the loop's backstop and a count the whole build was held to: `run-munnq7vz-98c3481c` was stopped at 48,
// and t1049's continuation "at its limit of 12 model calls" with money left. A purse is dollars, never a count of calls
// (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING").
describe("a declared call count", () => {
  it("bounds nothing: the loop is handed no turns, no calls and no declared count, whatever the resolution says", () => {
    for (const maxCallsPerRun of [1, 12, 26, 48, 500]) {
      const resolution: Pick<AutomationStudioLlmProviderResolution, "maxCallsPerRun" | "maxTotalEstimatedCostUsd"> = { maxCallsPerRun, maxTotalEstimatedCostUsd: 2 };
      const limits = automationStudioFlowBootstrapEvidenceLoopLimits(resolution);
      expect(limits).toEqual({ loop: { minToolCalls: 1, budget: { maxCostUsd: 2, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS } } });
    }
  });

  it("bounds nothing when a Flow configures one either", () => {
    const provider = { metadata: { provider: "mock", model: "mock" }, runTask: async () => ({}) };
    const resolution = automationStudioLlmResolutionWithinFlowSettings({ provider, ...AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, tokenLimits: { ...AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.tokenLimits } }, {
      llmExecutionSettings: { tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxCalls: 48, timeoutMs: 25_000, maxEstimatedCostUsd: 0.25, retryCount: 0 }
    });

    const limits = automationStudioFlowBootstrapEvidenceLoopLimits(resolution);
    expect(limits.loop).not.toHaveProperty("maxIterations");
    expect(limits.loop).not.toHaveProperty("maxToolCalls");
    expect(limits).not.toHaveProperty("declaredCalls");
    expect(limits).not.toHaveProperty("maxConsecutiveUnusableDecisions");
  });
});

describe("automationStudioFlowBootstrapEvidenceLoopLimits", () => {
  // The total was 64,000 bytes, then a 1 MiB backstop, and each decision was
  // shown a 24,000-byte window. Since 2026-09-30 the build hands the loop no
  // byte limit at all: every evidence entry is shown whole, and the only bound
  // on a request is the model's context window.
  // The one per-request ceiling is the model's context window, derived from the
  // model limits rather than restated (2026-09-30).
  it("holds a request only to the largest model context window", () => {
    expect(AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST).toBe(Math.max(...Object.values(AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS).map((limits) => limits.contextTokens)));
    expect(AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST).toBe(1_000_000);
  });

  it("hands the loop no evidence byte limit", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({});
    expect(limits.loop).not.toHaveProperty("maxEvidenceBytes");
    expect(limits.loop).not.toHaveProperty("maxEvidenceContextBytes");
    expect(limits).not.toHaveProperty("maxEstimatedCostUsdPerCall");
  });
});

// The user's rule: a run costs at most the ceiling ($0.10 since 2026-10-01;
// was $0.25). The build's total used to be the
// Flow's configured figure -- $1 as the web app saves it -- or else the
// resolver's $2, and the Flow's figure won even when it was the higher.
describe("the build's cost ceiling", () => {
  const provider = { metadata: { provider: "mock", model: "mock" }, runTask: async () => ({}) };
  const hostDefaults = { provider, ...AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, tokenLimits: { ...AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.tokenLimits } };

  it("defaults the total to the ceiling under the host's resolver, and when nothing names a total", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits(hostDefaults).loop.budget.maxCostUsd).toBe(CEILING);
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({}).loop.budget.maxCostUsd).toBe(CEILING);
  });

  it("honors an explicit resolver ceiling while allowing explicit user limits above the default", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits(hostDefaults, 1).loop.budget.maxCostUsd).toBe(CEILING);
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: 2 }, 5).loop.budget.maxCostUsd).toBe(2);
  });

  it("lets the Flow's setting lower it: a Flow set below the ceiling gets its own figure", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits(hostDefaults, CEILING * 0.4).loop.budget.maxCostUsd).toBe(CEILING * 0.4);
  });

  // Nothing enforced a per-call figure in a build: the build has no ledger, and
  // the loop's total is what stops it. The derived share only duplicated it.
  it("hands the build no per-call share of the total", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits(hostDefaults, 1)).not.toHaveProperty("maxEstimatedCostUsdPerCall");
  });
});
