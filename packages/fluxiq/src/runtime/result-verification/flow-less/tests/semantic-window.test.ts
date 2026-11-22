import { describe, expect, it } from "vitest";
import { AutomationStudioLlmProviderError, runAutomationStudioLlmHarness, type AutomationStudioJudgeEvidenceProjector, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

const ROWS = [{ name: "Original first", value: "Observed value" }, { name: "Original second", value: "Second observed value" }];
const RAW = "PRIVATE_CAPTURE_SENTINEL ".repeat(3000);
const LIMITS = { maxInputTokens: 300_000, maxOutputTokens: 4_000, maxTotalTokens: 304_000 };
const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
  const read = (input.evidence as JsonObject).evidence as JsonObject;
  return { role: "data", evidence: { source: (input.evidence as JsonObject).source!, observedRows: Array.isArray(read.records) ? read.records.length : 0 } };
};
const summary = (): AutomationStudioFlowLessSummary => ({ instructions: "List the original records with their names and values.", acts: [], rows: { totalRows: ROWS.length, truncated: false, columns: [{ id: "name", label: "Name" }, { id: "value", label: "Value" }], rows: ROWS }, trail: [{ callId: "actual.read.1", did: "example.read", found: { records: ROWS, page: RAW } }] });
function scripted() {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  const state = { refuses: false };
  const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "same-judge" }, estimateCostUsd: () => 0, runTask: async (request) => {
    seen.push(request);
    if (state.refuses) throw new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", "The provider's actual window refused this complete request.");
    return { response: { kind: "diagnosis", summary: "Checked the original values.", diagnosis: { answersRequest: "yes", checked: [{ row: "Original first", column: "value", value: "Observed value" }], answerRecords: { asked: true, siteShows: ROWS.length } } }, usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
  } };
  const run = (given = summary(), semantic = true) => automationStudioFlowLessJudge({ summary: given, provider, run: runAutomationStudioLlmHarness, projectId: "project", flowId: "flow", deniedEvidenceKeys: [], tokenLimits: LIMITS, ...(semantic ? { judgeEvidenceVersion: 1 as const, projectJudgeEvidence: projector } : {}) });
  return { seen, state, run };
}

function sentSummary(request: AutomationStudioLlmTaskRequest | undefined): AutomationStudioRunResultSummary {
  const shown = request?.context.resultSummary;
  if (shown === undefined) throw new Error("The actual provider request had no result summary.");
  return shown;
}

describe("complete semantic requests against the real harness", () => {
  it("keeps exact data on provider refusal and uses existing not-judged handling until a full check can be made", async () => {
    const test = scripted();
    test.state.refuses = true;
    const refused = await test.run();
    expect(refused.verdict).toBe("not_judged");
    expect(test.seen).toHaveLength(1);
    const sent = sentSummary(test.seen[0]);
    expect(sent.recordSets[0]!.sampleRows).toEqual(ROWS);
    expect(sent).not.toHaveProperty("summarised");
    expect(JSON.stringify(sent)).not.toContain("core.summarised");
    expect(JSON.stringify(sent)).not.toContain("PRIVATE_CAPTURE_SENTINEL");
    test.state.refuses = false;
    expect((await test.run()).verdict).toBe("yes");
    expect(test.seen).toHaveLength(2);
    expect(sentSummary(test.seen[1]).recordSets).toEqual(sent.recordSets);
  });

  it("measures actual provider-neutral request bytes and preserves the stable question/trail prefix before changing answer words", async () => {
    const test = scripted();
    expect((await test.run(summary(), false)).verdict).toBe("yes");
    expect((await test.run()).verdict).toBe("yes");
    expect((await test.run({ ...summary(), answerText: "The same retained records, checked again." })).verdict).toBe("yes");
    const [legacy, first, next] = test.seen;
    const firstSummary = sentSummary(first);
    const nextSummary = sentSummary(next);
    expect(Object.keys(firstSummary).slice(0, 2)).toEqual(["question", "trail"]);
    const beforeVariable = (value: AutomationStudioRunResultSummary) => JSON.stringify(value).split('"totalRecordCount"')[0]!;
    expect(beforeVariable(nextSummary)).toBe(beforeVariable(firstSummary));
    expect(firstSummary.recordSets[0]!.sampleRows).toEqual(ROWS);
    const legacyBytes = Buffer.byteLength(JSON.stringify(legacy));
    const semanticBytes = Buffer.byteLength(JSON.stringify(first));
    expect(semanticBytes).toBeLessThan(legacyBytes);
    console.info(`[semantic request] legacyBytes=${legacyBytes} semanticBytes=${semanticBytes} stableSummaryPrefixBytes=${Buffer.byteLength(beforeVariable(firstSummary))} rows=${ROWS.length}`);
  });
});
