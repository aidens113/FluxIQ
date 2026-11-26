// A Flow judge's check whose reply could not be read is asked again until one is read (t979; F25, live run
// `run-mwoznmcq-cd1d4618`: two of four Haiku judge replies were `llm.provider_malformed_response` and one more ask of
// the same request on the same model was all a check got). Each ask after one carries a note of what could not be
// read; every re-ask keeps the starting model; the purse, a refused key and the deadline still end it.
// No model is called: each rung is a scripted provider.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../../flows/authoring/model/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../../../llm/build-purse/index.ts";
import { AutomationStudioLlmProviderError, automationStudioLlmProviderRoutedByRole, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../../build-test/index.ts";
import { RUN_MUW60J7C_REQUEST, runMuw60j7cRunSummary } from "../../../request-rows/tests/run-muw60j7c.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

// How the judge is asked, not what Core settles first (as `../../verify.test.ts`).
vi.mock("../../../computed-facts/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../computed-facts/index.ts")>()),
  automationStudioResultComputedFacts: () => []
}));

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const NO = { answersRequest: "no", expected: "Only earbuds.", observed: "Two accessories are kept.", changed: "Leave out the accessories.", defects: [{ kind: "kept_not_asked", row: "Replacement Ear Tips for Wireless Earbuds, Memory Foam Eartips, 3 Pairs (S/M/L), Black", requestWords: "accessories" }] };
const RUNGS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;

type Call = { answer: Record<string, unknown> } | { fault: "unclosed" | "malformed" | "truncated" | "auth" };
type Seen = { model: string; request: AutomationStudioLlmTaskRequest };

/** One scripted call, whichever rung serves it. */
async function play(call: Call | undefined): Promise<Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>> {
  if (!call) throw new Error("no call scripted");
  if ("answer" in call) return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: call.answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
  if (call.fault === "unclosed") throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200, undefined, undefined, undefined, { case: "content_unclosed" });
  if (call.fault === "malformed") throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200);
  if (call.fault === "truncated") throw new AutomationStudioLlmProviderError("llm.provider_output_truncated", "Reply cut off.", false);
  throw new AutomationStudioLlmProviderError("llm.provider_auth_failed", "Key refused.", false, 401);
}

/** The attempt's routed provider on the ladder (`../../llm/role-routing/`): one scripted provider per rung, sharing one script. */
function laddered(calls: readonly Call[], price: (call: number) => number = () => 0.001): { provider: AutomationStudioLlmProvider; seen: Seen[] } {
  const seen: Seen[] = [];
  const rung = (model: string): AutomationStudioLlmProvider => ({
    metadata: { provider: "mock", model },
    estimateCostUsd: () => price(seen.length),
    runTask: async (request) => {
      const call = calls[seen.length];
      seen.push({ model, request });
      return await play(call);
    }
  });
  const tiers = RUNGS.map((model) => ({ model, provider: rung(model) }));
  return { seen, provider: automationStudioLlmProviderRoutedByRole({ explore: tiers[0]!.provider, ladder: { tiers, from: { explore: 0, judge: 0, repair: 0 } } }) };
}

const verify = (provider: AutomationStudioLlmProvider, extra: Partial<Parameters<typeof verifyAutomationStudioRunResult>[0]> = {}) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "build-test.1", summary: runMuw60j7cRunSummary(), instructions: [instruction], deniedEvidenceKeys: [], provider, ...extra });

describe("a Flow judge's check whose reply could not be read", () => {
  it("is asked again with a note naming what could not be read, last, on the same model", async () => {
    const { provider, seen } = laddered([{ fault: "unclosed" }, { answer: NO }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen.map((call) => call.model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5"]);
    expect(seen[0]!.request.context.resultSummary).not.toHaveProperty("unreadableReply");
    const noted = seen[1]!.request.context.resultSummary!;
    expect(noted.unreadableReply).toContain("could not be read: the JSON object never closed: it stopped part-way through.");
    expect(Object.keys(noted).at(-1)).toBe("unreadableReply");
    // The second check's first ask carries no note: its check has met nothing unreadable.
    expect(seen[2]!.request.context.resultSummary).not.toHaveProperty("unreadableReply");
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", basis: "model", calls: 2 });
    expect(report.interventions[1]?.metadata).toMatchObject({ verificationAsk: 2, verificationAfterUnreadable: 1 });
  });

  it("keeps the same starting model after repeated unreadable replies and on the next check", async () => {
    const { provider, seen } = laddered([{ fault: "malformed" }, { fault: "truncated" }, { fault: "malformed" }, { answer: NO }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen.map((call) => call.model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5"]);
    expect(seen.map((call) => call.request.metadata?.judgeRungsUp)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
    expect(report.interventions[2]?.metadata).toMatchObject({ verificationAfterUnreadable: 2 });
  });

  it("reconciles a readable answer reached after re-asks exactly as a first readable answer", async () => {
    const plain = await verify(laddered([{ answer: NO }, { answer: NO }]).provider);
    const { provider, seen } = laddered([{ fault: "malformed" }, { answer: NO }, { fault: "malformed" }, { fault: "malformed" }, { answer: NO }]);
    const reasked = await verify(provider);
    expect(seen).toHaveLength(5);
    expect(reasked.outcome).toEqual(plain.outcome);
  });

  it("never asks again after a refused key", async () => {
    const { provider, seen } = laddered([{ fault: "malformed" }, { fault: "auth" }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_unavailable", failureCode: "llm.provider_auth_failed" });
  });
});

describe("a build test's judge whose replies could not be read", () => {
  const CEILING = 0.25;
  const judge = (provider: AutomationStudioLlmProvider, extra: Partial<Parameters<typeof automationStudioBuildTestJudge>[0]> = {}) =>
    automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider, ...extra });

  it("still stops on the purse's refusal, not judged, with the spending limit's why", async () => {
    // The first call fits and is unreadable; the re-ask's worst case no longer fits what is left.
    const { provider, seen } = laddered([{ fault: "malformed" }, { answer: NO }], (call) => (call === 0 ? 0.05 * CEILING : 0.5 * CEILING));
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: CEILING, carriedUsd: CEILING - 0.1 * CEILING });
    const verdict = await automationStudioLlmBuildPurseScope(purse, () => judge(provider)({ summary: runMuw60j7cRunSummary(), budget: { maxCostUsd: purse.leftUsd() } }));
    expect(seen).toHaveLength(1);
    expect(verdict).toMatchObject({ verdict: "not_judged", why: expect.stringContaining(`spending limit of $${CEILING.toFixed(2)}`) });
  });

  it.each(["invalid_json", "invalid_diagnosis"])("charges billed %s replies against a standalone judgement's aggregate purse", async (fault) => {
    let sent = 0;
    const usage = { ...USAGE, estimatedCostUsd: 0.03 };
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.03,
      runTask: async () => {
        sent += 1;
        if (fault === "invalid_json") throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Broken JSON.", false, 200, undefined, undefined, undefined, { case: "content_unclosed", usage });
        return { response: { kind: "diagnosis", diagnosis: { answersRequest: "no", observed: 42 } }, usage };
      }
    };
    const verdict = await judge(provider)({ summary: runMuw60j7cRunSummary(), budget: { maxCostUsd: 0.1 } });
    expect(sent).toBe(3);
    expect(verdict).toMatchObject({ verdict: "not_judged", why: expect.stringContaining("spending limit of $0.10"), spent: { estimatedCostUsd: 0.09 } });
  });

  it("retains a billed malformed reply when the next request is pending at the deadline", async () => {
    let sent = 0;
    const usage = { ...USAGE, estimatedCostUsd: 0.03 };
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.03,
      runTask: async () => {
        sent += 1;
        if (sent === 1) throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Broken JSON.", false, 200, undefined, undefined, undefined, { case: "content_unclosed", usage });
        return await new Promise(() => undefined);
      }
    };
    const verdict = await judge(provider, { deadlineMs: 150 })({ summary: runMuw60j7cRunSummary(), budget: { maxCostUsd: 0.1 } });
    expect(sent).toBe(2);
    expect(verdict).toMatchObject({ verdict: "not_judged", spent: { calls: 1, estimatedCostUsd: 0.03, inputTokens: USAGE.inputTokens } });
  });

  it("ends at the judgement's existing deadline, not judged, and asks nothing more once it has passed", async () => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200);
      }
    };
    // The deadline and the provider's 5 ms are on a clock the test drives, so the deadline passes by what the test advances, never by how loaded the machine is.
    vi.useFakeTimers();
    let verdict: Awaited<ReturnType<ReturnType<typeof judge>>>;
    let asked: number;
    try {
      const judging = judge(provider, { deadlineMs: 150 })({ summary: runMuw60j7cRunSummary() });
      await vi.advanceTimersByTimeAsync(150);
      verdict = await judging;
      asked = seen.length;
      await vi.advanceTimersByTimeAsync(100);
      expect(seen.length).toBe(asked);
    } finally {
      vi.useRealTimers();
    }
    // The cause is said: the replies could not be read, asked again until the deadline.
    expect(verdict).toMatchObject({ verdict: "not_judged", why: expect.stringMatching(/^Until its deadline passed, the judge's reply could not be read: it was asked \d+ times, so the test was not judged\.$/) });
    expect(asked).toBeGreaterThan(2);
  });
});
