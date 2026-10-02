import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS, AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST, AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, automationStudioLlmResolutionWithinFlowSettings } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS } from "../../recovery/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS } from "../evidence-loop.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS, automationStudioFlowBootstrapEvidenceLoopLimits } from "../flow-bootstrap-evidence-loop.ts";

const CEILING = AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;

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
      maxCallsPerRun: 64, maxTotalTokensPerRun: 600_000, maxTotalEstimatedCostUsd: CEILING * 0.8,
      tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }
    });

    expect(limits.loop.budget).toEqual({ maxTotalTokens: 600_000, maxTokensPerDecision: 56_000, maxCostUsd: CEILING * 0.8, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS });
    expect(limits.loop.maxIterations).toBe(64);
  });

  it("names only the token bounds the resolution declared, and always the run cost ceiling", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({}).loop.budget).toEqual({ maxCostUsd: CEILING, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS });
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: 0.5 }).loop.budget).toMatchObject({ maxCostUsd: CEILING });
  });

  // Spend safety is a plain configured limit read from Flow settings
  // (`adaptationPolicySettings.maxEstimatedCostUsdPerRun`), not a grant, and it
  // can only lower the ceiling.
  it("takes the smallest of the ceiling, the resolution's total and the Flow's configured limit", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 10, maxTotalEstimatedCostUsd: 2 }, 0.5).loop.budget).toMatchObject({ maxCostUsd: CEILING });
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 10, maxTotalEstimatedCostUsd: CEILING * 0.8 }, CEILING * 0.6).loop.budget).toMatchObject({ maxCostUsd: CEILING * 0.6 });
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 10, maxTotalEstimatedCostUsd: CEILING * 0.48 }, CEILING * 0.6).loop.budget).toMatchObject({ maxCostUsd: CEILING * 0.48 });
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

  it("keeps the run cost ceiling when the Flow sets no usable limit", () => {
    for (const unset of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 10, maxTotalEstimatedCostUsd: 2 }, unset).loop.budget).toMatchObject({ maxCostUsd: CEILING });
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
// own ceiling.
describe("automationStudioFlowBootstrapEvidenceLoopLimits", () => {
  it("lets a 26-call resolution iterate 26 times, past the old cap of eight", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 26, maxTotalEstimatedCostUsd: 2 });

    expect(limits.loop).toEqual({ minToolCalls: 1, maxIterations: 26, maxToolCalls: 27, budget: { maxCostUsd: CEILING, maxDurationMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_DURATION_MS } });
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
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 26 });
    expect(limits.loop).not.toHaveProperty("maxEvidenceBytes");
    expect(limits.loop).not.toHaveProperty("maxEvidenceContextBytes");
  });

  it("never configures more than the loop accepts", () => {
    const limits = automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 500 });

    expect(limits.loop.maxIterations).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations);
    expect(limits.loop.maxToolCalls).toBe(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls);
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxCallsPerRun: 3 }).loop).toMatchObject({ maxIterations: 3, maxToolCalls: 4 });
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

  it("never lets the Flow's setting raise it: a Flow set to $1 still gets the ceiling", () => {
    expect(automationStudioFlowBootstrapEvidenceLoopLimits(hostDefaults, 1).loop.budget.maxCostUsd).toBe(CEILING);
    expect(automationStudioFlowBootstrapEvidenceLoopLimits({ maxTotalEstimatedCostUsd: 2 }, 5).loop.budget.maxCostUsd).toBe(CEILING);
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
