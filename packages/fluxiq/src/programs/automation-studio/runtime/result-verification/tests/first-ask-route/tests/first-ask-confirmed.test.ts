// A confirming verification says whether its yes was first-ask confirmed
// (t677, `../../../first-ask/`), recorded where its calls are made: a retry after a
// temporary fault, or the exclusion-evidence recheck of a yes, does not clear
// it; a yes reached by re-asking a call that said otherwise -- a refuted no
// (t607), a contradicted unsure (t503), a split's no (t515) -- never carries
// it. No model is called: the provider is scripted per call. Generic fixtures
// (a paging read, a garden catalogue, a lamp shop), not a Lab scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../../model/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../../contracts/index.ts";
import { LAMP_SHADE, LAMPS_INSTRUCTION, SAME_LAMP_NO, lampsRunSummary } from "../../../refuted-no/tests/lamps-fixture.ts";
import { REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS, requestWordsRunSummary } from "../../../request-rows/tests/request-words-fixture.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** One scripted call: an answer, or a provider timeout. */
type Call = { answer: Record<string, unknown> } | { fault: "timeout" };

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
        if ("fault" in call) throw new AutomationStudioLlmProviderError("llm.provider_timeout", "Provider request ended.", true);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: call.answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const instruction = (title: string, body: string): AutomationStudioFlowInstruction => ({
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title, body,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
});

/** A read that followed five pages and stopped because the list had no next page: a plain yes over it is taken. */
const ended: AutomationStudioResultReadAccount = { nodeId: "n2", definitionId: "extract", pagesRead: 5, pageLimit: 10, stop: "control_disabled", truncated: false, kept: 13, paginates: true };
const PAGED: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 13, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [],
  flowShape: [{ nodeId: "n1", definitionId: "navigate" }, { nodeId: "n2", definitionId: "extract" }], withheld: false, reads: [ended]
};
const YES = { answersRequest: "yes", expected: "Every matching item.", observed: "13 rows, each matching." };
const PAGING = { answersRequest: "unknown", observed: "The search reports over 1,000 results, but later pages were never read, so I cannot confirm every match was kept." };

const verify = (provider: AutomationStudioLlmProvider, extra: Partial<Parameters<typeof verifyAutomationStudioRunResult>[0]> = {}) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "build-test.1", summary: PAGED, instructions: [instruction("Goal", "List every matching item.")], deniedEvidenceKeys: [], provider, confirmAnswer: true, ...extra });

/** The outcome's flag, read as the build-test judge reads it. */
const flag = (report: Awaited<ReturnType<typeof verify>>) => report.outcome.performed ? report.outcome.firstAskConfirmed : undefined;

describe("a confirming verification's yes, first-ask confirmed", () => {
  it("is said of two first-ask yeses", async () => {
    const report = await verify(scripted([{ answer: YES }, { answer: YES }]).provider);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "answers", calls: 2, firstAskConfirmed: true });
  });

  it("is still said where the first call timed out and was asked again: that ask gave no verdict, three calls on record", async () => {
    const { provider, seen } = scripted([{ fault: "timeout" }, { answer: YES }, { answer: YES }]);
    const report = await verify(provider);
    expect(seen).toHaveLength(3);
    expect(report.interventions).toHaveLength(3);
    expect(report.outcome).toMatchObject({ verdict: "answers", firstAskConfirmed: true });
  });

  it("is still said where a yes lacking its exclusion evidence was rechecked and said yes again: the verdict never changed", async () => {
    const STOCK = `Copper Garden Tools Pair is left out, as the request says "leaving out out-of-stock items".`;
    const yesSaying = (handle: string) => ({ answersRequest: "yes", observed: `${STOCK} Replacement Handle for Garden Tools is left out, ${handle}.` });
    const complete = yesSaying("as the request says \"replacement parts\"");
    const { provider, seen } = scripted([{ answer: yesSaying("because the request asks for \"garden tools\"") }, { answer: complete }, { answer: complete }]);
    const report = await verify(provider, { summary: requestWordsRunSummary(), instructions: [instruction("Collect the catalogue", REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS)] });
    expect(seen).toHaveLength(3);
    expect(report.interventions[1]?.metadata).toMatchObject({ verificationEvidenceRecheck: true });
    expect(report.outcome).toMatchObject({ verdict: "answers", firstAskConfirmed: true });
  });

  it("is never said of a runtime check's single yes", async () => {
    const report = await verify(scripted([{ answer: YES }]).provider, { confirmAnswer: false });
    expect(report.outcome).toMatchObject({ verdict: "answers", calls: 1 });
    expect(flag(report)).toBeUndefined();
  });
});

describe("a yes reached by re-asking a call that said otherwise", () => {
  it("is not first-ask confirmed after a contradicted unsure asked again (t503)", async () => {
    const report = await verify(scripted([{ answer: PAGING }, { answer: YES }, { answer: YES }]).provider);
    expect(report.outcome).toMatchObject({ verdict: "answers", calls: 3, contradictedUnsure: { reasked: true } });
    expect(flag(report)).toBeUndefined();
  });

  it("is not first-ask confirmed after a split's no asked again (t515)", async () => {
    const quoted = { answersRequest: "yes", observed: `Copper Garden Tools Pair is left out, as the request says "leaving out out-of-stock items". Replacement Handle for Garden Tools is left out, as the request says "replacement parts".` };
    const no = { answersRequest: "no", observed: "A row that is not a tool was left out.", changed: "Add a condition that excludes refurbished bundles such as the Copper Garden Tools Pair row." };
    const report = await verify(scripted([{ answer: quoted }, { answer: no }, { answer: quoted }]).provider, { summary: requestWordsRunSummary(), instructions: [instruction("Collect the catalogue", REQUEST_WORDS_REQUEST_TWO_EXCLUSIONS)] });
    expect(report.outcome).toMatchObject({ verdict: "answers", verdicts: ["answers", "does_not_answer", "answers"], calls: 3 });
    expect(flag(report)).toBeUndefined();
  });

  it("is not first-ask confirmed after two refuted nos asked again (t607), the t664 towels trial's shape", async () => {
    const NO = { answersRequest: "no", ...SAME_LAMP_NO };
    const LAMP_YES = { answersRequest: "yes", expected: SAME_LAMP_NO.expected, observed: `Condition 1 (sponsored is absent) follows "Leave out sponsored listings". Condition 2 (rating atLeast 4) follows "rated 4 or higher". "${LAMP_SHADE}" is left out as "spare parts such as spare bulbs or lamp shades" says.` };
    const report = await verify(scripted([{ answer: NO }, { answer: NO }, { answer: LAMP_YES }, { answer: LAMP_YES }]).provider, { summary: lampsRunSummary(), instructions: [LAMPS_INSTRUCTION] });
    expect(report.outcome).toMatchObject({ verdict: "answers", calls: 4, refutedNo: { reasked: true } });
    expect(flag(report)).toBeUndefined();
  });
});
