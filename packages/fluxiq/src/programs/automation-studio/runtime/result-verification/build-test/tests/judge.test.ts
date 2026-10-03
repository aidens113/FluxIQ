// How the build reads the results verifier's answer about its test (t195-w25,
// section 4.5): the verdict mapping, what it costs, and when it is not asked.
// No model is called: the provider is scripted, or `verify` is injected.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../../llm/build-purse/index.ts";
import { AUTOMATION_STUDIO_LLM_JUDGE_REPLY_TOKENS, AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { verifyAutomationStudioRunResult, type AutomationStudioResultVerificationReport, type AutomationStudioResultVerificationRequest } from "../../verify.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import {
  ACCEPT_FRIENDS, FRIENDS, PICKUP_CART, RUN_36_STEPS, RUN_40_CLAIMS, RUN_40_STEPS,
  run36Report, run40, run41Steps
} from "./live-run-drafts.ts";
import { DENIED, SITE, replayed, report, verified } from "./draft-steps.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

const instruction = (body: string): AutomationStudioFlowInstruction => ({
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
});

/** A provider that answers each verification call in turn, with the rest of what the judgement said. */
function scripted(answers: readonly string[], said: Record<string, string> = {}): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const answer = answers[seen.length];
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: answer, ...said } }, usage: USAGE };
      }
    }
  };
}

const judge = (body: string, options: Partial<Parameters<typeof automationStudioBuildTestJudge>[0]> = {}) =>
  automationStudioBuildTestJudge({ instructions: [instruction(body)], deniedEvidenceKeys: DENIED, projectId: "project-1", flowId: "flow-1", ...options });

const run40Summary = () => automationStudioBuildTestResultSummary({
  steps: RUN_40_STEPS, report: report([...RUN_40_STEPS.slice(0, -1).map(replayed), verified(run40.towelsAdd)]), nodes: [],
  instructionText: PICKUP_CART, result: { summary: "Added.", acts: RUN_40_CLAIMS }, startLocation: SITE, deniedEvidenceKeys: DENIED
});

describe("a judged no carries the judge's reading to the repair", () => {
  it("run 36: maps two scripted noes to no, with what was observed and no record-set finding a test cannot have", async () => {
    const summary = automationStudioBuildTestResultSummary({
      steps: RUN_36_STEPS, report: run36Report(), nodes: [], instructionText: ACCEPT_FRIENDS,
      result: { summary: "Accepted.", acts: [{ action: "a1", step: "4" }] }, startLocation: FRIENDS, deniedEvidenceKeys: DENIED
    });
    const { provider, seen } = scripted(["no", "no"], {
      expected: "Every request from someone with at least five mutual friends accepted, and a table of them.",
      observed: "Step 6 confirms Priya Nair (4 mutual); step 4's condition excludes Jonas Weber (5); only 4 requests were listed; no step reads the accepted requests.",
      changed: "Fix step 4's condition, press See all before it, and add a read of the accepted requests."
    });
    const verdict = await judge(ACCEPT_FRIENDS, { provider })({ summary, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({
      verdict: "no",
      observed: expect.stringContaining("Priya Nair (4 mutual)"),
      expected: expect.stringContaining("at least five"),
      advice: expect.stringContaining("See all"),
      findings: []
    });
    // What the model was sent is the test's packet, whole.
    expect(seen[0]?.context.resultSummary?.buildTest?.steps[3]?.observed).toEqual({ rows: [{ name: "Amara Osei", mutual: "23 mutual friends" }], itemsSeen: 4 });
    // Verify may ask twice, so each call gets half of what the build has left.
    expect(seen[0]?.maxEstimatedCostUsd).toBe(0.1);
  });

  it("run 40: maps a scripted no to no", async () => {
    const { provider } = scripted(["no", "no"], { observed: "No step searches for or adds the napkins; two packs are never set.", changed: "Add steps that search the napkins, choose 250 Count and add them; set the towels' quantity to two." });
    const verdict = await judge(PICKUP_CART, { provider })({ summary: run40Summary(), budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "no", observed: expect.stringContaining("napkins"), advice: expect.stringContaining("250 Count") });
    expect(verdict.spent).toEqual({ inputTokens: 1800, outputTokens: 120, totalTokens: 1920, estimatedCostUsd: 0.002, calls: 2 });
  });

  // t195-w37 (live run run-murwcaj0-40e56557): a build ends "not doable" only when the judge says what was asked
  // can no longer be had, so a no carries the judge's stillAchievable (a reply with any other word is refused by the
  // harness's schema, and the verdict reader's screen is pinned in ../../tests/verdict.test.ts).
  it("carries the judge's stillAchievable on a no", async () => {
    for (const said of ["no", "yes", "unknown"] as const) {
      const { provider } = scripted(["no", "no"], { observed: "No step reads the list after the confirms.", stillAchievable: said });
      const verdict = await judge(PICKUP_CART, { provider })({ summary: run40Summary(), budget: { maxCostUsd: 0.2 } });
      expect(verdict, said).toMatchObject({ verdict: "no", stillAchievable: said });
    }
    const { provider } = scripted(["no", "no"], { observed: "No step reads the list after the confirms." });
    const silent = await judge(PICKUP_CART, { provider })({ summary: run40Summary(), budget: { maxCostUsd: 0.2 } });
    expect(silent.verdict).toBe("no");
    expect("stillAchievable" in silent).toBe(false);
  });

  // A build measures a repair by what its test stored (t240): the counts the verdict was reached from travel with a no.
  it("carries the summary's stored, refused and missing-required counts on a no", async () => {
    const summary = { ...run40Summary(), totalRecordCount: 7, totalRefusedCount: 3, totalRowsMissingRequired: 2 };
    const { provider } = scripted(["no", "no"], { observed: "Seven rows stored, three refused." });
    const verdict = await judge(PICKUP_CART, { provider })({ summary, budget: { maxCostUsd: 0.2 } });
    expect(verdict).toMatchObject({ verdict: "no", records: { stored: 7, refused: 3, missingRequired: 2 } });
  });
});

describe("the verdict mapping", () => {
  const report = (outcome: AutomationStudioResultVerificationReport["outcome"], calls = 1): AutomationStudioResultVerificationReport => ({
    outcome,
    interventions: Array.from({ length: calls }, (_, index) => ({ tokenUsage: { ...USAGE, estimatedCostUsd: 0.01 * (index + 1) } }) as never)
  });
  const answered = (verdict: "answers" | "does_not_answer" | "unsure", basis: "model" | "model_disagreed" | "model_unconfirmed") => ({
    schemaVersion: "automation-studio.result-verification.v1" as const, performed: true as const, verdict, basis, code: "c", reason: `the reason (${basis})`, observation: "o"
  });

  it("answers is yes, with every call's spend summed", async () => {
    const verdict = await judge(PICKUP_CART, { verify: async () => report(answered("answers", "model"), 2) })({ summary: run40Summary() });
    expect(verdict).toEqual({ verdict: "yes", spent: { inputTokens: 1800, outputTokens: 120, totalTokens: 1920, estimatedCostUsd: 0.03, calls: 2 } });
  });

  it("two unsure answers are unknown, never a pass and never a repair", async () => {
    const { provider, seen } = scripted(["unknown", "unknown"]);
    const verdict = await judge(PICKUP_CART, { provider })({ summary: run40Summary(), budget: { maxCostUsd: 0.2 } });
    expect(seen).toHaveLength(2);
    expect(verdict).toMatchObject({ verdict: "unknown", why: expect.any(String) });
    expect(verdict.spent.totalTokens).toBe(1920);
    // Each call the judge made is counted, so the build can count it with its other calls outside the loop.
    expect(verdict.spent.calls).toBe(2);
  });

  it("a no the second call did not repeat is unknown", async () => {
    const verdict = await judge(PICKUP_CART, { verify: async () => report(answered("does_not_answer", "model_disagreed"), 2) })({ summary: run40Summary() });
    expect(verdict).toMatchObject({ verdict: "unknown", why: "the reason (model_disagreed)" });
  });

  it("a judge with no model to ask is not_judged", async () => {
    const verdict = await judge(PICKUP_CART)({ summary: run40Summary() });
    expect(verdict).toMatchObject({ verdict: "not_judged", spent: { totalTokens: 0, estimatedCostUsd: 0 } });
  });

  it("a judge past its deadline is not_judged", async () => {
    const verdict = await judge(PICKUP_CART, { verify: () => new Promise<never>(() => undefined), deadlineMs: 5 })({ summary: run40Summary() });
    expect(verdict).toMatchObject({ verdict: "not_judged", why: expect.stringContaining("deadline") });
  });

  it("no cost left asks nothing", async () => {
    const calls: AutomationStudioResultVerificationRequest[] = [];
    const verify = async (request: AutomationStudioResultVerificationRequest) => { calls.push(request); return report(answered("answers", "model")); };
    const verdict = await judge(PICKUP_CART, { verify })({ summary: run40Summary(), budget: { maxCostUsd: 0 } });
    expect(calls).toHaveLength(0);
    expect(verdict).toMatchObject({ verdict: "not_judged", spent: { estimatedCostUsd: 0, calls: 0 } });
  });

  it("asks within what the build has left, under a build-test run id", async () => {
    const calls: AutomationStudioResultVerificationRequest[] = [];
    const verify = async (request: AutomationStudioResultVerificationRequest) => { calls.push(request); return report(answered("answers", "model")); };
    await judge(PICKUP_CART, { verify })({ summary: run40Summary(), budget: { maxCostUsd: 0.07 } });
    expect(calls[0]).toMatchObject({ maxEstimatedCostUsd: 0.035, deniedEvidenceKeys: DENIED, projectId: "project-1", flowId: "flow-1" });
    expect(calls[0]?.runId).toMatch(/^build-test\./u);
  });

  it("an unknown or unjudged test with carried steps it never ran names them", async () => {
    const summary = automationStudioBuildTestResultSummary({ steps: run41Steps(), nodes: [], instructionText: PICKUP_CART, result: { summary: "Extended." }, startLocation: SITE, deniedEvidenceKeys: DENIED });
    const unsure = await judge(PICKUP_CART, { verify: async () => report(answered("unsure", "model_unconfirmed"), 2) })({ summary });
    expect(unsure).toMatchObject({ verdict: "unknown", untestedCarried: [5, 6, 7, 8, 9] });
    const unasked = await judge(PICKUP_CART)({ summary, budget: { maxCostUsd: 0 } });
    expect(unasked).toMatchObject({ verdict: "not_judged", untestedCarried: [5, 6, 7, 8, 9] });
  });

  it("a cancelled build is thrown, not judged", async () => {
    const controller = new AbortController();
    const verify = () => new Promise<never>(() => { controller.abort(); });
    await expect(judge(PICKUP_CART, { verify, signal: controller.signal })({ summary: run40Summary() })).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("a judge under the build's purse (t234)", () => {
  /** A Flow creation's ceiling, as configured (FLUXIQ_LLM_RUN_COST_CEILING_USD). */
  const CEILING = AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;
  /** `scripted`, priced: each call's worst case is `worstCase(call)`, the purse's measure of it before it is sent. */
  function priced(answers: readonly string[], worstCase: (call: number) => number) {
    const llm = scripted(answers);
    return { ...llm, provider: { ...llm.provider, estimateCostUsd: () => worstCase(llm.seen.length) } satisfies AutomationStudioLlmProvider };
  }
  /** A purse with `leftUsd` left of the ceiling, the rest spent by earlier builds of this Flow. */
  const purseWith = (leftUsd: number) => new AutomationStudioLlmBuildPurse({ ceilingUsd: CEILING, carriedUsd: CEILING - leftUsd });

  it("sets no cap of its own: the purse holds each call at its true worst case", async () => {
    const calls: AutomationStudioResultVerificationRequest[] = [];
    const verify = async (request: AutomationStudioResultVerificationRequest) => {
      calls.push(request);
      return { outcome: { schemaVersion: "automation-studio.result-verification.v1" as const, performed: true as const, verdict: "answers" as const, basis: "model" as const, code: "c", reason: "r", observation: "o" }, interventions: [] };
    };
    const purse = purseWith(0.5 * CEILING);
    await automationStudioLlmBuildPurseScope(purse, () => judge(PICKUP_CART, { verify })({ summary: run40Summary(), budget: { maxCostUsd: purse.leftUsd() } }));
    expect(calls).toHaveLength(1);
    // Half of what is left, per call, used to refuse a judge call the purse could pay for.
    expect(calls[0]).not.toHaveProperty("maxEstimatedCostUsd");
  });

  it("a call the purse refuses is not judged, says the spending limit stopped it, and throws nothing", async () => {
    // Some cost is left, so the judge is asked; its call's worst case is more than that, so the purse refuses it unsent.
    const { provider, seen } = priced(["yes"], () => 0.2 * CEILING);
    const purse = purseWith(0.1 * CEILING);

    const verdict = await automationStudioLlmBuildPurseScope(purse, () => judge(PICKUP_CART, { provider })({ summary: run40Summary(), budget: { maxCostUsd: purse.leftUsd() } }));

    expect(seen).toHaveLength(0);
    // It used to come back as `unknown`: verify reads a refused call as one that did not come back usable.
    expect(verdict).toMatchObject({ verdict: "not_judged", why: expect.stringContaining(`spending limit of $${CEILING.toFixed(2)}`), spent: { estimatedCostUsd: 0 } });
    expect(purse.spentUsd()).toBeCloseTo(CEILING - 0.1 * CEILING, 12);
  });

  it("run 38 (C7): the judge's call is held at a 2,000-token reply, so $0.009 left still pays for it", async () => {
    // Priced on the reply alone, at a rate that makes the default 8,000-token allowance the $0.011 hold run 38 refused.
    const outputRateUsd = 0.0112 / 8_000;
    const asked: number[] = [];
    const llm = scripted(["yes"]);
    const provider: AutomationStudioLlmProvider = { ...llm.provider, estimateCostUsd: ({ outputTokens }) => { asked.push(outputTokens); return outputTokens * outputRateUsd; } };
    const purse = purseWith(0.009);

    const verdict = await automationStudioLlmBuildPurseScope(purse, () => judge(PICKUP_CART, { provider })({ summary: run40Summary(), budget: { maxCostUsd: purse.leftUsd() } }));

    expect(verdict).toMatchObject({ verdict: "yes" });
    expect(llm.seen).toHaveLength(1);
    expect(llm.seen[0]?.tokenLimits.maxOutputTokens).toBe(AUTOMATION_STUDIO_LLM_JUDGE_REPLY_TOKENS);
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked)).toEqual(new Set([AUTOMATION_STUDIO_LLM_JUDGE_REPLY_TOKENS]));
    expect(AUTOMATION_STUDIO_LLM_JUDGE_REPLY_TOKENS * outputRateUsd).toBeCloseTo(0.0028, 12);
  });

  it("a reply allowance a resolver named smaller than the judge's cap is kept", async () => {
    const { provider, seen } = scripted(["yes"]);
    await judge(PICKUP_CART, { provider, verify: (request) => verifyAutomationStudioRunResult({ ...request, tokenLimits: { maxOutputTokens: 500 } }) })({ summary: run40Summary() });
    expect(seen[0]?.tokenLimits.maxOutputTokens).toBe(500);
  });

  it("a second ask the purse refuses is not judged either, and the first call's spend is still returned", async () => {
    // The first call fits and answers no; asked again, the second's worst case no longer fits.
    const { provider, seen } = priced(["no", "no"], (call) => (call === 0 ? 0.05 * CEILING : 0.5 * CEILING));
    const purse = purseWith(0.1 * CEILING);

    const verdict = await automationStudioLlmBuildPurseScope(purse, () => judge(PICKUP_CART, { provider })({ summary: run40Summary(), budget: { maxCostUsd: purse.leftUsd() } }));

    expect(seen).toHaveLength(1);
    expect(verdict).toMatchObject({ verdict: "not_judged", why: expect.stringContaining("spending limit"), spent: { totalTokens: USAGE.totalTokens, estimatedCostUsd: USAGE.estimatedCostUsd } });
  });
});
