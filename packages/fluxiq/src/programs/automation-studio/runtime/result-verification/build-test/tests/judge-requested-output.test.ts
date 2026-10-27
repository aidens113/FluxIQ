// A project build's trial judged yes over no records, where its task spec
// declares a part asking for records (t757), is not a yes the build finishes
// on: it is unknown, its reason naming what is missing, and the confirming call
// is not spent. A part declaring nothing is judged as before. No model is
// called: the provider is scripted. The request is unlike any realistic task.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";
import type { AutomationStudioBuildTestTaskChecklist } from "../task-checklist.ts";

const REQUEST = "Record the museum's three oldest exhibits with columns name and year.";
const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};
const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

function yesEveryCall(): { provider: AutomationStudioLlmProvider; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    provider: {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async () => {
        calls += 1;
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes", observed: "The exhibits were read." } }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    }
  };
}

/** A whole trial that read three values and kept no record. */
const trial: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [],
  flowShape: [{ nodeId: "n1", definitionId: "web.output.browser-navigate" }, { nodeId: "n2", definitionId: "web.output.dom-extract", label: "read the first name" }], withheld: false
};

const checklist = (answer?: { kind: "records"; columns: string[] }): AutomationStudioBuildTestTaskChecklist => ({
  parts: [{ id: "p1", words: REQUEST, goalFacts: ["three exhibits are recorded"], lastingActs: [], ...(answer ? { answer } : {}) }], notAsked: []
});

describe("the build-test judge on a yes over no records the task spec declares owed (t757)", () => {
  const judge = (provider: AutomationStudioLlmProvider) => automationStudioBuildTestJudge({ provider, instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1" });

  it("is unknown, its reason naming the part and columns owed, after one call", async () => {
    const { provider, calls } = yesEveryCall();
    const verdict = await judge(provider)({ summary: trial, taskChecklist: checklist({ kind: "records", columns: ["name", "year"] }) });
    expect(verdict.verdict).toBe("unknown");
    if (verdict.verdict !== "unknown") throw new Error(verdict.verdict);
    expect(verdict.why).toContain("part p1 (columns: name, year) asks for records, and this run stored none");
    expect(calls()).toBe(1);
  });

  it("is a yes, confirmed as ever, where no part declares an answer", async () => {
    const { provider, calls } = yesEveryCall();
    const verdict = await judge(provider)({ summary: trial, taskChecklist: checklist() });
    expect(verdict.verdict).toBe("yes");
    expect(calls()).toBe(2);
  });
});
