// K5 (t1087, t1089): the Flow-less judge's first ask gives each stored row that shares its label with another row a
// handle, the label and its rank among the rows sharing it, and says the shared citation rule beside them. Live run
// `run-mwz2jc4w-0c207128`'s judge cited one of two rows sharing a label by a qualifier of its own, matched no row, and
// learned the handles only from Core's refusal on the re-ask. Through the real harness with a scripted provider: no model
// is called. The site is a kind no realistic scenario uses (a garden centre).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_CITATION_RULE } from "../../cited-yes/index.ts";
import { automationStudioFlowLessJudge, automationStudioFlowLessJudgedSummary, type AutomationStudioFlowLessSummary } from "../index.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

const SHARED: NonNullable<AutomationStudioFlowLessSummary["rows"]> = {
  totalRows: 3,
  truncated: false,
  columns: [{ id: "item", label: "item" }, { id: "price", label: "price" }],
  rows: [{ item: "Seed Tray", price: "$2.15" }, { item: "Seed Tray", price: "$3.40" }, { item: "Watering Can", price: "$8.00" }]
};
const DISTINCT: NonNullable<AutomationStudioFlowLessSummary["rows"]> = { ...SHARED, rows: [{ item: "Seed Tray", price: "$2.15" }, { item: "Plant Food", price: "$3.40" }, { item: "Watering Can", price: "$8.00" }] };

const summary = (rows: NonNullable<AutomationStudioFlowLessSummary["rows"]>): AutomationStudioFlowLessSummary => ({
  instructions: "List every item in my basket as a table with columns item and price.",
  rows,
  acts: [],
  answerText: "Three items are in the basket."
});

/** A yes that cites a row by a qualifier of its own, which no stored row's label is: Core refutes it, and it comes back the same. */
const QUALIFIED = { answersRequest: "yes", checked: [{ row: "Seed Tray (large)", column: "price", value: "$3.40" }], answerRecords: { asked: true, siteShows: 3 } };

function scripted(): { provider: AutomationStudioLlmProvider; seen: AutomationStudioLlmTaskRequest[] } {
  const seen: AutomationStudioLlmTaskRequest[] = [];
  return {
    seen,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: QUALIFIED }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

const judge = (provider: AutomationStudioLlmProvider, rows: NonNullable<AutomationStudioFlowLessSummary["rows"]>) => automationStudioFlowLessJudge({ summary: summary(rows), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [] });
const sentOf = (request: AutomationStudioLlmTaskRequest | undefined) => request!.context.resultSummary as unknown as JsonObject & { recordSets: Array<{ sampleRows: JsonObject[] }> };

describe("the Flow-less judge's first ask over rows that share a label", () => {
  it("gives each such row its handle and says the shared citation rule beside them", async () => {
    const { provider, seen } = scripted();
    await judge(provider, SHARED);
    const first = sentOf(seen[0]);
    expect(first.recordSets[0]!.sampleRows.map((row) => row.rowHandle)).toEqual(["Seed Tray #1", "Seed Tray #2", undefined]);
    expect(first.validCitation).toBe(AUTOMATION_STUDIO_RESULT_CITATION_RULE);
    expect(first.validCitation).toContain("rowHandle");
    expect(first).not.toHaveProperty("citationsNotMatched");
  });

  it("says the rule once on the re-ask after a refuted yes, beside the rows, and names the handles in Core's refusal", async () => {
    const { provider, seen } = scripted();
    const judged = await judge(provider, SHARED);
    expect(judged.verdict).toBe("unsure");
    expect(seen).toHaveLength(2);
    const again = sentOf(seen[1]);
    expect(again.validCitation).toBe(AUTOMATION_STUDIO_RESULT_CITATION_RULE);
    expect(again.citationsNotMatched).not.toHaveProperty("validCitation");
    expect(JSON.stringify((again.citationsNotMatched as JsonObject).notMatched)).toContain("Seed Tray #2");
    expect(again.recordSets[0]!.sampleRows.map((row) => row.rowHandle)).toEqual(["Seed Tray #1", "Seed Tray #2", undefined]);
  });

  it("leaves the deciding digest's copy without handles: the judge's copy only", () => {
    const { sent } = automationStudioFlowLessJudgedSummary(summary(SHARED), []);
    expect(JSON.stringify(sent)).not.toContain("rowHandle");
    expect(sent).not.toHaveProperty("validCitation");
  });
});

describe("the Flow-less judge over rows whose labels are their own", () => {
  it("adds no handle and no rule to the first ask, and says the shared rule on the re-ask", async () => {
    const { provider, seen } = scripted();
    await judge(provider, DISTINCT);
    const first = sentOf(seen[0]);
    expect(JSON.stringify(first)).not.toContain("rowHandle");
    expect(first).not.toHaveProperty("validCitation");
    expect(seen).toHaveLength(2);
    expect((sentOf(seen[1]).citationsNotMatched as JsonObject).validCitation).toBe(AUTOMATION_STUDIO_RESULT_CITATION_RULE);
  });
});
