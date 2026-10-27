// A yes is held to the answer the build declared its task asks for (t757,
// auction `run-mveba82m-fd0616dc`: every judge said yes over `recordSetCount 0`
// to a request for a record with three columns). The obligation is the task
// spec's typed `answer`, carried on the judge's checklist or passed by a caller
// that holds it, never read off the request's words. No model is called: the
// provider is scripted per call. The site and request here are deliberately
// unlike the run's.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import type { AutomationStudioResultReadAccount, AutomationStudioResultTaskChecklist, AutomationStudioRunResultSummary } from "../../../contracts/index.ts";
import { automationStudioResultRequestedOutputMissing, automationStudioResultRequestedOutputOwed } from "../../../requested-output/index.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

const REQUEST = "On the city library's site, find the branch that opens latest on Sunday and record its opening hours with columns day, opens and closes.";
const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const YES = { answersRequest: "yes", expected: "The branch's Sunday hours as a record.", observed: "The run read the branch's hours." };
const COLUMNS = ["day", "opens", "closes"];

/** A provider that answers each call with `answers` in order, recording what each was sent. */
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
        if (!answer) throw new Error("no call scripted");
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

/** Three single-value reads after opening the branch's page, as the run's Flow shape: nothing stores a record. */
const READS_ONE_BY_ONE: AutomationStudioRunResultSummary["flowShape"] = [
  { nodeId: "n1", definitionId: "web.output.browser-navigate", label: "open the branches page" },
  { nodeId: "n2", definitionId: "web.output.dom-click", label: "open the branch" },
  { nodeId: "n3", definitionId: "web.output.dom-extract", label: "read the day" },
  { nodeId: "n4", definitionId: "web.output.dom-extract", label: "read the opening time" },
  { nodeId: "n5", definitionId: "web.output.dom-extract", label: "read the closing time" }
];

function summary(change: Partial<AutomationStudioRunResultSummary> = {}): AutomationStudioRunResultSummary {
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [],
    flowShape: READS_ONE_BY_ONE, withheld: false, ...change
  };
}

/** The project build's checklist, its one part declaring (or not) the answer it asks for. */
function checklist(answer?: { kind: "records"; columns: string[] }, lastingActs: string[] = []): AutomationStudioResultTaskChecklist {
  return { supplementary: "Supplementary.", asked: [{ part: "p1", words: REQUEST, goalFacts: ["the branch's Sunday hours are recorded"], lastingActs, ...(answer ? { answer } : {}) }], notAsked: [] };
}

const verify = (provider: AutomationStudioLlmProvider, judged: AutomationStudioRunResultSummary, extra: Partial<Parameters<typeof verifyAutomationStudioRunResult>[0]> = {}) =>
  verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary: judged, instructions: [instruction], deniedEvidenceKeys: [], provider, ...extra });

describe("a yes held to the answer the build declared", () => {
  it("is held unsure, naming the records owed, where the task spec asks for records and the run stored none", async () => {
    const judged = summary({ taskChecklist: checklist({ kind: "records", columns: COLUMNS }) });
    const { provider, seen } = scripted([YES, YES]);
    const report = await verify(provider, judged, { confirmAnswer: true });
    expect(report.outcome).toMatchObject({
      performed: true, verdict: "unsure", basis: "model", code: "core.result.requested_output_missing",
      requestedOutputMissing: { parts: [{ part: "p1", columns: COLUMNS }] }
    });
    if (!report.outcome.performed) throw new Error("not performed");
    expect(report.outcome.reason).toContain("p1 (columns: day, opens, closes)");
    expect(report.outcome.requestedOutputMissing?.said).toContain("stored none");
    // It fails a run, and is never a yes a build finishes on.
    expect(report.outcome.failure).toBeDefined();
    expect(report.outcome).not.toHaveProperty("firstAskConfirmed");
    // The yes's own reading is kept for the build; the record would not change, so its confirmation is not asked.
    expect(report.outcome.answeredReading).toEqual({ expected: YES.expected, observed: YES.observed });
    expect(seen).toHaveLength(1);
  });

  it("holds a finished run's single yes the same way where its caller passes the declaration", async () => {
    const owed = { parts: [{ part: "p1", columns: COLUMNS }] };
    const { provider } = scripted([YES]);
    const report = await verify(provider, summary(), { requestedOutput: owed });
    expect(report.outcome).toMatchObject({ verdict: "unsure", code: "core.result.requested_output_missing", requestedOutputMissing: owed });
  });

  it("keeps a yes on a run that stored the records asked for", async () => {
    const judged = summary({
      taskChecklist: checklist({ kind: "records", columns: COLUMNS }),
      totalRecordCount: 1, recordSetCount: 1,
      recordSets: [{ datasetId: "hours", recordCount: 1, refusedCount: 0, truncated: false, columns: COLUMNS, columnsWithheld: false, rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [] }]
    });
    expect(automationStudioResultRequestedOutputOwed(judged)).toEqual({ parts: [{ part: "p1", columns: COLUMNS }] });
    expect(automationStudioResultRequestedOutputMissing(judged, automationStudioResultRequestedOutputOwed(judged))).toBeUndefined();
    const { provider } = scripted([YES, YES]);
    const report = await verify(provider, judged, { confirmAnswer: true });
    expect(report.outcome).toMatchObject({ verdict: "answers", code: "core.result.answers_request" });
    expect(report.outcome).not.toHaveProperty("requestedOutputMissing");
  });

  it("keeps a yes on an honestly empty answer: a read that saw its list end and kept nothing", async () => {
    const ended: AutomationStudioResultReadAccount = { nodeId: "n6", definitionId: "web.output.dom-extract_list", pagesRead: 3, stop: "control_disabled", truncated: false, paginates: true, itemsSeen: 31, kept: 0 };
    const judged = summary({ taskChecklist: checklist({ kind: "records", columns: COLUMNS }), reads: [ended] });
    expect(automationStudioResultRequestedOutputMissing(judged, automationStudioResultRequestedOutputOwed(judged))).toBeUndefined();
    const { provider } = scripted([YES, YES]);
    const report = await verify(provider, judged, { confirmAnswer: true });
    expect(report.outcome).toMatchObject({ verdict: "answers" });
    // The same read stopped by its own page bound shows nothing about the pages it did not read.
    const bounded = summary({ taskChecklist: checklist({ kind: "records", columns: COLUMNS }), reads: [{ ...ended, stop: "page_limit", pageLimit: 3, truncated: true }] });
    expect(automationStudioResultRequestedOutputMissing(bounded, automationStudioResultRequestedOutputOwed(bounded))).toMatchObject({ parts: [{ part: "p1" }] });
  });

  it("leaves an action-only request as it was: no declared answer owes no records", async () => {
    const judged = summary({ taskChecklist: checklist(undefined, ["create_new"]) });
    expect(automationStudioResultRequestedOutputOwed(judged)).toBeUndefined();
    const { provider, seen } = scripted([YES, YES]);
    const report = await verify(provider, judged, { confirmAnswer: true });
    expect(report.outcome).toMatchObject({ verdict: "answers", code: "core.result.answers_request" });
    expect(seen).toHaveLength(2);
  });
});
