// A computed fact that fails is a Core no, with no judge asked; the facts that
// hold reach the judge's copy, and a yes is still the judge's to give
// (framework plan P5, `../../../verify.ts`). The facts are stubbed in: their own
// modules are tested beside them. No model is called: the provider is scripted
// per call. On the made-up library catalog of
// `../../../located-defects/tests/garden-catalog-fixture.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../../build-test/index.ts";
import { automationStudioResultComputedFacts } from "../../../computed-facts/index.ts";
import { automationStudioResultVerificationFailsRun, type AutomationStudioResultComputedFact, type AutomationStudioRunResultSummary } from "../../../contracts/index.ts";
import { catalogInstruction, catalogRunSummary, GLOVE_HOOK, SEARCH_WORDS } from "../../../located-defects/tests/garden-catalog-fixture.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

vi.mock("../../../computed-facts/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../computed-facts/index.ts")>()),
  automationStudioResultComputedFacts: vi.fn(() => [])
}));
const computed = vi.mocked(automationStudioResultComputedFacts);

const FAILS: AutomationStudioResultComputedFact = {
  kind: "count", status: "fails",
  said: "Core counted 3 stored rows where the build declared 2.",
  defects: [{ kind: "kept_not_asked", row: GLOVE_HOOK, requestWords: SEARCH_WORDS }]
};
const HOLDS: AutomationStudioResultComputedFact = { kind: "columns", status: "holds", said: "Core read every stored row carrying both asked columns, title and format." };
const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A provider that answers each call with the next diagnosis, recording what each was sent. */
function scripted(answers: ReadonlyArray<Record<string, unknown>>): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        const answer = answers[seen.length];
        seen.push(request);
        if (!answer) throw new AutomationStudioLlmProviderError("llm.provider_auth_failed", "No call scripted.", false, 401);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const verify = (provider: AutomationStudioLlmProvider | undefined, summary = catalogRunSummary()) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary, instructions: [catalogInstruction()], deniedEvidenceKeys: [], ...(provider ? { provider } : {}) });

const YES = { answersRequest: "yes", expected: "Every result of the search.", observed: "The result holds the two titles the search showed." };

/** The catalog result with nothing left out and two plain titles kept: a yes over it is taken as given. */
function plainSummary(): AutomationStudioRunResultSummary {
  const summary = catalogRunSummary();
  const rows = (summary.recordSets[0]!.sampleRows ?? []).slice(0, 2);
  const { reads: _reads, ...rest } = summary;
  return { ...rest, totalRecordCount: 2, recordSets: [{ ...summary.recordSets[0]!, recordCount: 2, rowsChecked: 2, sampleRows: rows }] };
}

beforeEach(() => {
  computed.mockReset();
  computed.mockReturnValue([]);
});

describe("a computed fact that fails", () => {
  it("is a Core no: no provider is called, and the no carries the facts' words and located defects", async () => {
    computed.mockReturnValue([HOLDS, FAILS]);
    const { provider, seen } = scripted([YES, YES]);
    const report = await verify(provider);
    expect(seen).toHaveLength(0);
    expect(report.interventions).toEqual([]);
    const outcome = report.outcome;
    expect(outcome).toMatchObject({ performed: true, verdict: "does_not_answer", basis: "core_observation", code: "core.result.computed_fact_failed", observation: FAILS.said });
    if (!outcome.performed) throw new Error("not performed");
    expect(outcome.reason).toContain(FAILS.said);
    expect(automationStudioResultVerificationFailsRun(outcome)).toBe(true);
    // Where a judge's located no carries its defects, and Core's sentence as a finding and a checked line.
    expect(outcome.repair?.judgement?.defects).toEqual(FAILS.defects);
    expect(outcome.repair?.findings[0]).toEqual({ code: "result.computed_fact_failed", detail: FAILS.said });
    expect(outcome.repair?.checked).toEqual([FAILS.said]);
    expect(outcome.failure).toMatchObject({ category: "output_not_observed", code: "core.result.computed_fact_failed", stage: "verification" });
    expect(outcome.failure?.expected).toContain(FAILS.said);
    expect(outcome.failure?.actual).toContain(FAILS.said);
    // Computed from the summary, the request's text and its instructions, as the contract says.
    expect(computed).toHaveBeenCalledWith(expect.objectContaining({ requestText: `${catalogInstruction().title}\n${catalogInstruction().body}`, summary: expect.objectContaining({ totalRecordCount: 3 }) }));
  });

  it("is a Core no with no model configured at all", async () => {
    computed.mockReturnValue([FAILS]);
    expect((await verify(undefined)).outcome).toMatchObject({ performed: true, verdict: "does_not_answer", code: "core.result.computed_fact_failed" });
  });

  it("reaches a build test's judge as a no with Core's finding and checked line", async () => {
    computed.mockReturnValue([FAILS]);
    const judge = automationStudioBuildTestJudge({ instructions: [catalogInstruction()], projectId: "project-1", flowId: "flow-1" });
    const verdict = await judge({ summary: catalogRunSummary() });
    expect(verdict).toMatchObject({ verdict: "no", checked: [FAILS.said], spent: { calls: 0 } });
    expect(verdict.verdict === "no" ? verdict.findings : []).toContain("result.computed_fact_failed");
  });
});

describe("computed facts that hold", () => {
  it("reach the judge's copy only, before earlierAdvice, every other field where it was", async () => {
    computed.mockReturnValue([HOLDS]);
    const summary = { ...plainSummary(), earlierAdvice: [{ revision: 1, verdict: "no" as const, advice: "Keep the format column.", followed: "unchanged" as const, said: "Revision 1's judge advised keeping the format column; this revision did not change it." }] };
    const { provider, seen } = scripted([YES]);
    const report = await verify(provider, summary);
    expect(report.outcome).toMatchObject({ verdict: "answers" });
    const sent = seen[0]!.context.resultSummary as unknown as Record<string, unknown>;
    expect(sent.computedFacts).toEqual([{ kind: "columns", status: "holds", said: HOLDS.said }]);
    const keys = Object.keys(sent);
    expect(keys.indexOf("earlierAdvice")).toBeGreaterThan(0);
    expect(keys.indexOf("computedFacts")).toBe(keys.indexOf("earlierAdvice") - 1);
    // The caller's summary is never changed.
    expect("computedFacts" in summary).toBe(false);
  });

  it("are never a yes: the judge is still asked, and its no or unsure stands", async () => {
    computed.mockReturnValue([HOLDS]);
    const no = { answersRequest: "no", expected: "Every result.", observed: "A title is missing.", defects: [{ kind: "other", row: "order", requestWords: "list every result the search shows" }] };
    const refused = scripted([no, no, no, no]);
    const outcome = (await verify(refused.provider)).outcome;
    expect(refused.seen.length).toBeGreaterThanOrEqual(2);
    expect(outcome).not.toMatchObject({ verdict: "answers" });
    const unsure = scripted([{ answersRequest: "unknown", observed: "Cannot tell." }, { answersRequest: "unknown", observed: "Cannot tell." }]);
    expect((await verify(unsure.provider)).outcome).toMatchObject({ verdict: "unsure" });
  });

  it("leave the judge's copy as it was where none hold", async () => {
    const { provider, seen } = scripted([YES]);
    expect((await verify(provider, plainSummary())).outcome).toMatchObject({ verdict: "answers" });
    expect(seen[0]!.context.resultSummary).not.toHaveProperty("computedFacts");
  });
});
