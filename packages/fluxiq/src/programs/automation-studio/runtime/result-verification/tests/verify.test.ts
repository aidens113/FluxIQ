// A check whose call did not come back for a temporary reason is asked again
// (t473, live run `run-mv5q4j5c-49bfb5e2`: a judge cut off at 19,985 ms was
// never asked again). No model is called: the provider is scripted per call.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmFlowPurseScope } from "../../llm/build-purse/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../llm/index.ts";
import { automationStudioResultVerificationDeadlineMs, AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS } from "../deadline.ts";
import { RUN_MUW60J7C_REQUEST, runMuw60j7cRunSummary } from "../request-rows/tests/run-muw60j7c.ts";
import {
  REQUEST_WORDS_NAMES, REQUEST_WORDS_HANDLE, REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS, requestWordsRunSummary
} from "../request-rows/tests/request-words-fixture.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts.ts";
import { AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK, verifyAutomationStudioRunResult } from "../verify.ts";

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const NO = { answersRequest: "no", expected: "Only earbuds.", observed: "Two accessories are kept.", changed: "Leave out the accessories." };

/** What one scripted call does: answer with a diagnosis, or fail as `fault` says. */
type Call = { answer: Record<string, unknown> } | { fault: "timeout" | "unavailable" | "untyped" | "truncated" | "malformed" | "auth" };

/** A provider that plays `calls` in order, recording what each was sent. */
function scripted(calls: readonly Call[]): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const call = calls[seen.length];
        seen.push(request);
        if (!call) throw new Error("no call scripted");
        if ("answer" in call) return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: call.answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
        if (call.fault === "timeout") throw new AutomationStudioLlmProviderError("llm.provider_timeout", "Provider request ended.", true);
        if (call.fault === "unavailable") throw new AutomationStudioLlmProviderError("llm.provider_http_error", "Provider unavailable.", true, 503);
        if (call.fault === "truncated") throw new AutomationStudioLlmProviderError("llm.provider_output_truncated", "Reply cut off at the length limit.", false);
        if (call.fault === "malformed") throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false);
        if (call.fault === "auth") throw new AutomationStudioLlmProviderError("llm.provider_auth_failed", "Key refused.", false, 401);
        throw new Error("something unexplained");
      }
    }
  };
}

const verify = (provider: AutomationStudioLlmProvider, extra: Partial<Parameters<typeof verifyAutomationStudioRunResult>[0]> = {}) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "build-test.1", summary: runMuw60j7cRunSummary(), instructions: [instruction], deniedEvidenceKeys: [], provider, ...extra });

afterEach(() => { vi.useRealTimers(); });

describe("a verification check that did not come back", () => {
  it("is asked again after a timeout, with the same evidence, and the answer it then gives stands", async () => {
    const { provider, seen } = scripted([{ fault: "timeout" }, { answer: NO }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(3);
    expect(seen[1]?.context.resultSummary).toEqual(seen[0]?.context.resultSummary);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "does_not_answer", calls: 2 });
    // Every ask is a call on record: the timed-out one, its re-ask, and the second check.
    expect(report.interventions.map((intervention) => [intervention.metadata?.verificationCheck, intervention.metadata?.verificationAsk])).toEqual([[1, undefined], [1, 2], [2, undefined]]);
    expect(new Set(report.interventions.map((intervention) => intervention.interventionId)).size).toBe(3);
  });

  it("is asked again after a temporary provider fault its own retries could not get past", async () => {
    vi.useFakeTimers();
    // Three attempts inside the first call (the provider retry policy's), then the re-ask answers.
    const { provider, seen } = scripted([{ fault: "unavailable" }, { fault: "unavailable" }, { fault: "unavailable" }, { answer: NO }, { answer: NO }]);
    const pending = verify(provider);
    await vi.advanceTimersByTimeAsync(10_000);
    const report = await pending;
    expect(seen).toHaveLength(5);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer" });
    expect(report.interventions).toHaveLength(3);
  });

  it("asks the second check again too, so a no it then repeats refutes rather than staying unsure", async () => {
    const { provider, seen } = scripted([{ answer: NO }, { fault: "timeout" }, { answer: NO }]);
    const report = await verify(provider, { confirmAnswer: true });
    expect(seen).toHaveLength(3);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
    expect(report.interventions.map((intervention) => [intervention.metadata?.verificationCheck, intervention.metadata?.verificationAsk])).toEqual([[1, undefined], [2, undefined], [2, 2]]);
  });

  it("is asked at most twice: a check that timed out twice gives no answer, and is never a refutation", async () => {
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_ASKS_PER_CHECK).toBe(2);
    const { provider, seen } = scripted([{ fault: "timeout" }, { fault: "timeout" }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_unavailable", failureCode: "llm.provider_timeout" });
    expect(report.outcome.reason).toContain("ran out of time");
    expect(report.interventions).toHaveLength(2);
  });

  it("is not asked again after a fault that is not temporary, or once the run is cancelled", async () => {
    const untyped = scripted([{ fault: "untyped" }, { answer: NO }]);
    expect((await verify(untyped.provider)).outcome).toMatchObject({ basis: "model_unavailable" });
    expect(untyped.seen).toHaveLength(1);

    const controller = new AbortController();
    const cancelled: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request) => {
        cancelled.push(request);
        controller.abort();
        throw new AutomationStudioLlmProviderError("llm.provider_timeout", "Provider request ended.", true);
      }
    };
    await verify(provider, { signal: controller.signal });
    expect(cancelled).toHaveLength(1);
  });

  // t515 (live run `run-mv6v2kzn-d593231f`, step 0088): the result check's one
  // reply looped a sentence until it was cut off at 8,192 tokens, and that
  // unread reply was recorded as a refutation. A reply that arrived and could
  // not be read is a spent call (`../../llm/failure-disposition.ts`), so it is
  // asked once more, as a temporary fault is.
  it("is asked again after a reply cut off at the length limit, and the answer it then gives stands", async () => {
    const { provider, seen } = scripted([{ fault: "truncated" }, { answer: NO }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(3);
    expect(seen[1]?.context.resultSummary).toEqual(seen[0]?.context.resultSummary);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "does_not_answer", basis: "model", calls: 2 });
    expect(report.interventions.map((intervention) => [intervention.metadata?.verificationCheck, intervention.metadata?.verificationAsk])).toEqual([[1, undefined], [1, 2], [2, undefined]]);
  });

  it("is asked again after a reply that was not JSON", async () => {
    const { provider, seen } = scripted([{ fault: "malformed" }, { answer: NO }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(3);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer", calls: 2 });
  });

  it("asks an unreadable check only once more: two cut-off replies give no answer, never a third call", async () => {
    const { provider, seen } = scripted([{ fault: "truncated" }, { fault: "truncated" }, { answer: NO }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_unavailable", failureCode: "llm.provider_output_truncated" });
    expect(report.interventions).toHaveLength(2);
  });

  it("is not asked again after a refused key", async () => {
    const { provider, seen } = scripted([{ fault: "auth" }, { answer: NO }]);
    expect((await verify(provider)).outcome).toMatchObject({ basis: "model_unavailable", failureCode: "llm.provider_auth_failed" });
    expect(seen).toHaveLength(1);
  });

  it("charges each ask to the Flow's purse", async () => {
    const charged: number[] = [];
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, carriedUsd: 0, onSettled: (usd) => charged.push(usd) });
    const { provider } = scripted([{ fault: "timeout" }, { answer: NO }, { answer: NO }]);
    await automationStudioLlmFlowPurseScope(flow, async () => await verify(provider));
    // Three calls settle: the timed-out one at its hold (its cost is not known), and the two that answered at what they reported.
    expect(charged).toHaveLength(3);
    expect(flow.spentCalls()).toBe(3);
  });
});

// t503 (lane C round 17, `run-mv6lgqi6-4bfab2e1`, trial 3): one check could not
// tell because "later pages were never read", against every paging read's own
// account that its list ended, and the other said yes. That check is asked once
// more, with Core's record named on its copy (`../agreement.ts`).
describe("an unsure beside a yes whose doubt about pages Core's record contradicts", () => {
  /** A read that followed five pages and stopped because the list had no next page. */
  const ended: AutomationStudioResultReadAccount = { nodeId: "n2", definitionId: "extract", pagesRead: 5, pageLimit: 10, stop: "control_disabled", truncated: false, kept: 13, paginates: true };
  const summary: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 13, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [],
    flowShape: [{ nodeId: "n1", definitionId: "navigate" }, { nodeId: "n2", definitionId: "extract" }], withheld: false, reads: [ended]
  };
  const PAGING = { answersRequest: "unknown", observed: "The search reports over 1,000 results, but later pages were never read, so I cannot confirm every match was kept." };
  const YES = { answersRequest: "yes", expected: "Every matching item.", observed: "13 rows, each matching." };

  it("asks the doubting check once more with the record named, and a yes there beside the other yes answers", async () => {
    const { provider, seen } = scripted([{ answer: PAGING }, { answer: YES }, { answer: YES }]);
    const report = await verify(provider, { confirmAnswer: true, summary });
    expect(seen).toHaveLength(3);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "answers", verdicts: ["unsure", "answers", "answers"], calls: 3, contradictedUnsure: { call: 1, reasked: true } });
    expect(report.interventions).toHaveLength(3);
    expect(report.interventions.map((intervention) => [intervention.metadata?.verificationCheck, intervention.metadata?.verificationReask])).toEqual([[1, undefined], [2, undefined], [1, true]]);
    // Only the re-ask's copy names the record.
    expect(seen[0]?.context.resultSummary).not.toHaveProperty("recheck");
    expect(seen[1]?.context.resultSummary).not.toHaveProperty("recheck");
    expect(String(seen[2]?.context.resultSummary?.recheck)).toContain("every page (5) and the list ended");
  });

  it("stays unsure, never a yes, when the re-asked check still doubts the pages, and asks no more", async () => {
    const { provider, seen } = scripted([{ answer: PAGING }, { answer: YES }, { answer: PAGING }, { answer: YES }]);
    const report = await verify(provider, { confirmAnswer: true, summary });
    expect(seen).toHaveLength(3);
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_disagreed", verdicts: ["unsure", "answers", "unsure"], calls: 3, contradictedUnsure: { reasked: true } });
    expect(report.interventions).toHaveLength(3);
  });

  it("asks nothing more where the record leaves the paging open", async () => {
    const { provider, seen } = scripted([{ answer: PAGING }, { answer: YES }, { answer: YES }]);
    const report = await verify(provider, { confirmAnswer: true, summary: { ...summary, reads: [{ ...ended, pageLimit: 5, stop: "page_limit", truncated: true }] } });
    expect(seen).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "unsure", calls: 2 });
  });
});

describe("the deadline a verification runs under", () => {
  it("fits every ask at the per-call timeout, and is the default without one", () => {
    expect(automationStudioResultVerificationDeadlineMs(undefined)).toBe(AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS);
    expect(automationStudioResultVerificationDeadlineMs(20_000)).toBe(AUTOMATION_STUDIO_RESULT_VERIFICATION_DEADLINE_MS);
    // A build's 45 s calls: two checks, each asked twice, and the reads around them.
    expect(automationStudioResultVerificationDeadlineMs(45_000)).toBe(4 * 45_000 + 30_000);
  });
});

// The request's own words, end to end (t515, live run `run-mv6v2hx5-f448e662`):
// a yes over a row a condition alone left out quotes, beside it, the request's
// words that exclude it, and a split's no whose advice excludes by words the
// request never states is asked once more with that named. A generic
// catalogue, not a scenario the Lab measures.
describe("a verification held to the request's own words", () => {
  const catalogue = (body: string): AutomationStudioFlowInstruction => ({ ...instruction, title: "Collect the catalogue", body });
  const held = (provider: AutomationStudioLlmProvider, extra: Partial<Parameters<typeof verifyAutomationStudioRunResult>[0]> = {}) =>
    verify(provider, { summary: requestWordsRunSummary(), instructions: [catalogue(REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS)], ...extra });
  const STOCK_SAID = `Copper Garden Tools Pair is left out, as the request says "leaving out out-of-stock items".`;
  const yesSaying = (handle: string) => ({ answersRequest: "yes", observed: `${STOCK_SAID} Replacement Handle for Garden Tools is left out, ${handle}.` });

  it("corrects deficient explanation within the check and then independently confirms the yes", async () => {
    const deficient = yesSaying("because the request asks for \"garden tools\"");
    const complete = yesSaying("as the request says \"replacement parts\"");
    const { provider, seen } = scripted([{ answer: deficient }, { answer: complete }, { answer: complete }]);
    const report = await held(provider, { confirmAnswer: true });
    expect(report.outcome).toMatchObject({ verdict: "answers", calls: 2 });
    expect(seen).toHaveLength(3);
    expect(String(seen[1]?.context.resultSummary?.recheck)).toContain(REQUEST_WORDS_HANDLE);
    expect(seen[1]?.context.instructions).toEqual(seen[0]?.context.instructions);
    expect(report.interventions.map((entry) => entry.metadata?.verificationCheck)).toEqual([1, 1, 2]);
  });

  it("corrects a deficient confirming explanation without replacing the first check", async () => {
    const complete = yesSaying("as the request says \"replacement parts\"");
    const { provider, seen } = scripted([{ answer: complete }, { answer: yesSaying("no quotation supplied") }, { answer: complete }]);
    const report = await held(provider, { confirmAnswer: true });
    expect(report.outcome).toMatchObject({ verdict: "answers", calls: 2 });
    expect(seen).toHaveLength(3);
    expect(report.interventions.map((entry) => entry.metadata?.verificationCheck)).toEqual([1, 2, 2]);
  });

  it("shares its ask allowance with a temporary fault instead of adding another correction ask", async () => {
    const deficient = yesSaying("no quotation supplied");
    const { provider, seen } = scripted([{ fault: "truncated" }, { answer: deficient }, { answer: deficient }, { answer: deficient }]);
    const report = await held(provider, { confirmAnswer: true });
    expect(seen).toHaveLength(4);
    expect(report.outcome).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    expect(report.interventions.map((entry) => [entry.metadata?.verificationCheck, entry.metadata?.verificationAsk])).toEqual([[1, undefined], [1, 2], [2, undefined], [2, 2]]);
  });

  it("does not turn an evidence correction into permission to ignore a genuine no", async () => {
    const deficient = yesSaying("no quotation supplied");
    const no = { answersRequest: "no", observed: "A required row was lost.", changed: "Restore the missing row." };
    const { provider, seen } = scripted([{ answer: deficient }, { answer: no }, { answer: no }]);
    const report = await held(provider, { confirmAnswer: true });
    expect(seen).toHaveLength(3);
    expect(report.outcome).toMatchObject({ verdict: "does_not_answer" });
    expect(report.outcome).not.toHaveProperty("exclusionEvidenceMissing");
  });

  it("uses the existing evidence screen for corrective feedback", async () => {
    const deficient = yesSaying("no quotation supplied");
    const complete = yesSaying("as the request says \"replacement parts\"");
    const { provider, seen } = scripted([{ answer: deficient }, { answer: complete }]);
    await held(provider, { deniedEvidenceKeys: ["recheck"] });
    expect(seen).toHaveLength(2);
    expect(seen[1]?.context.resultSummary).not.toHaveProperty("recheck");
  });

  it("charges corrective asks to the same purse and does not retry a refused key", async () => {
    const deficient = yesSaying("no quotation supplied");
    const { provider, seen } = scripted([{ answer: deficient }, { fault: "auth" }]);
    const charged: number[] = [];
    const flow = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.25, carriedUsd: 0, onSettled: (usd) => charged.push(usd) });
    const report = await automationStudioLlmFlowPurseScope(flow, () => held(provider));
    expect(seen).toHaveLength(2);
    expect(charged).toHaveLength(2);
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_unavailable", failureCode: "llm.provider_auth_failed" });
    expect(report.interventions[1]?.metadata).toMatchObject({ verificationAsk: 2, verificationEvidenceRecheck: true });
  });

  it("does not take a yes whose reason for a left-out row is only the words the request searched by", async () => {
    const unquoted = yesSaying("because the request asks for \"garden tools\"");
    const { provider, seen } = scripted(Array.from({ length: 4 }, () => ({ answer: unquoted })));
    const report = await held(provider);
    expect(seen).toHaveLength(4);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "unsure", basis: "model_unconfirmed", code: "core.result.exclusion_evidence_missing" });
    const checked = report.outcome.performed ? report.outcome.exclusionEvidenceMissing ?? [] : [];
    expect(checked.join("\n")).toContain(`without quoting, beside this row, words of the request that exclude it; it was left out by ${REQUEST_WORDS_NAMES.handle} alone (Read read) -- ${REQUEST_WORDS_HANDLE}`);
  });

  it("takes a yes that quotes, beside each left-out row, the request's own excluding words", async () => {
    const { provider, seen } = scripted([{ answer: yesSaying("as the request says \"replacement parts\"") }]);
    const report = await held(provider);
    expect(seen).toHaveLength(1);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "answers" });
  });

  it("asks a split's no once more when its advice excludes by words the request never states", async () => {
    const quoted = yesSaying("as the request says \"replacement parts\"");
    const no = { answersRequest: "no", observed: "A row that is not a tool was left out.", changed: "Add a condition that excludes refurbished bundles such as the Copper Garden Tools Pair row." };
    const { provider, seen } = scripted([{ answer: quoted }, { answer: no }, { answer: quoted }]);
    const report = await held(provider, { confirmAnswer: true });
    expect(seen).toHaveLength(3);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "answers", verdicts: ["answers", "does_not_answer", "answers"], calls: 3 });
    expect(report.interventions.map((intervention) => [intervention.metadata?.verificationCheck, intervention.metadata?.verificationReask])).toEqual([[1, undefined], [2, undefined], [2, true]]);
    expect(String(seen[2]?.context.resultSummary?.recheck)).toContain("never states as an exclusion: \"excludes refurbished bundles such as the Copper Garden Tools Pair row\"");
  });
});
