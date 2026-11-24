// A Flow-less no carries what it found wrong, screened, beside its words (t1011, run-mwug2xjw-41f62603:
// the defects a no listed were dropped where it became words). Through the real harness with a
// scripted provider: no model is called. The site is made up (a garden centre's plants).
import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import { automationStudioFlowLessJudgedNoFound } from "../judged-no-found.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const summary: AutomationStudioFlowLessSummary = {
  instructions: "List the perennials no taller than a metre, with their heights.",
  rows: { totalRows: 2, truncated: false, columns: [{ id: "name", label: "Name" }, { id: "height", label: "Height" }], rows: [{ name: "Lavender", height: "40cm" }, { name: "Foxglove", height: "150cm" }] },
  acts: []
};
const KEPT = { kind: "kept_not_asked", row: "Foxglove", column: "height", value: "150cm", requestWords: "no taller than a metre" };
const SECRET = "sk-abcdefghij0123456789abcd";

function scripted(diagnosis: Record<string, unknown>): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    estimateCostUsd: () => 0.001,
    runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis }, usage: USAGE }) as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>
  };
}

const judge = (diagnosis: Record<string, unknown>) => automationStudioFlowLessJudge({ summary, provider: scripted(diagnosis), run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: [] });

describe("what a Flow-less no found wrong", () => {
  it("is its defects, as it listed them, beside its words", async () => {
    const judged = await judge({ answersRequest: "no", observed: "A tall plant is kept.", expected: "Only plants up to a metre.", defects: [KEPT, { kind: "asked_missing", row: "every row", column: "colour", requestWords: "with their heights" }] });
    expect(judged.verdict).toBe("no");
    expect(judged.reason).toContain("A tall plant is kept.");
    expect(judged.found?.defects).toEqual([KEPT, { kind: "asked_missing", row: "every row", column: "colour", requestWords: "with their heights" }]);
  });

  it("drops a defect whose words are credential-shaped, and carries the rest", async () => {
    const judged = await judge({ answersRequest: "no", observed: "A tall plant is kept.", defects: [KEPT, { kind: "wrong_value", row: SECRET, column: "height", requestWords: "with their heights" }] });
    expect(judged.found?.defects).toEqual([KEPT]);
    expect(JSON.stringify(judged)).not.toContain(SECRET);
  });

  it("is nothing on a yes or an unsure", async () => {
    const yes = await judge({ answersRequest: "yes", checked: [{ row: "Lavender", column: "height", value: "40cm" }], answerRecords: { asked: true, siteShows: 1 } });
    expect(yes.found).toBeUndefined();
    const unsure = await judge({ answersRequest: "unknown", observed: "No view shows the heights.", defects: [KEPT] });
    expect(unsure.verdict).toBe("unsure");
    expect(unsure.found).toBeUndefined();
  });

  it("is nothing where the directive names no defect and no row", () => {
    expect(automationStudioFlowLessJudgedNoFound(undefined)).toBeUndefined();
    expect(automationStudioFlowLessJudgedNoFound({ schemaVersion: "automation-studio.result-repair-directive.v1", findings: [], fix: ["A fix line about a Flow."], judgement: { observed: "No." } })).toBeUndefined();
    expect(automationStudioFlowLessJudgedNoFound({ schemaVersion: "automation-studio.result-repair-directive.v1", findings: [], fix: [], checked: ["A line of Core's."] })).toEqual({ checkedRows: ["A line of Core's."] });
  });
});
