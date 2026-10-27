// The judge is shown the single values steps returned in the run, labelled as
// handed on and not stored (t757, auction `run-mveba82m-fd0616dc`: three read
// values reached the judge only as authored target text and the end page, never
// as what the run returned, and nothing said they were not a stored record).
// Read off `outputs.value`, Core's port for a node's single value, screened as
// every run value is. No model is called: the provider is scripted.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../../llm/index.ts";
import { summarizeAutomationStudioRunResult } from "../../../result-summary.ts";
import { verifyAutomationStudioRunResult } from "../../../verify.ts";

const DENIED = ["password", "token"];
const node = (id: string, definitionId: string, label: string): AutomationStudioFlowNode =>
  ({ id, definitionId, definitionVersion: "1.0.0", label, parameterValues: {} }) as unknown as AutomationStudioFlowNode;
const nodes = [node("n1", "web.output.dom-click", "open the branch"), node("n2", "web.output.dom-extract", "read the day"), node("n3", "web.output.dom-extract", "read the opening time")];
const attempt = (nodeId: string, status: string, outputs: Record<string, unknown>) => ({ nodeId, status, outputs });

describe("the values a run's steps returned", () => {
  it("are listed in run order by step, labelled as handed on and not stored, beside no record set", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [], flowNodes: nodes, deniedEvidenceKeys: DENIED,
      sessionAttempts: [attempt("n1", "succeeded", { result: { clicked: true } }), attempt("n2", "succeeded", { value: "Sunday", result: { extracted: "Sunday" } }), attempt("n3", "succeeded", { value: "11:00" })]
    });
    expect(summary.returned?.values).toEqual([{ nodeId: "n2", value: "Sunday" }, { nodeId: "n3", value: "11:00" }]);
    expect(summary.returned?.said).toContain("not a stored record");
    expect(summary.recordSetCount).toBe(0);
    expect(summary.withheld).toBe(false);
  });

  it("are none without a declaration of denied keys, and something is said withheld", () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, sessionAttempts: [attempt("n2", "succeeded", { value: "Sunday" })] });
    expect(summary).not.toHaveProperty("returned");
    expect(summary.withheld).toBe(true);
  });

  it("leave out a failed step, a value that is no single value, and one the run withheld or that is credential-shaped, saying so", () => {
    const summary = summarizeAutomationStudioRunResult({
      recordSets: [], flowNodes: nodes, deniedEvidenceKeys: DENIED,
      sessionAttempts: [
        attempt("n1", "failed", { value: "never read" }),
        attempt("n2", "succeeded", { value: { day: "Sunday" } }),
        attempt("n3", "succeeded", { value: "sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c" }),
        attempt("n3", "succeeded", { value: 42 })
      ]
    });
    expect(summary.returned?.values).toEqual([{ nodeId: "n3", value: 42 }]);
    expect(summary.withheld).toBe(true);
  });

  it("reach the judge's request as the summary carries them", async () => {
    const summary = summarizeAutomationStudioRunResult({ recordSets: [], flowNodes: nodes, deniedEvidenceKeys: DENIED, sessionAttempts: [attempt("n2", "succeeded", { value: "Sunday" })] });
    expect(summary.returned?.values).toEqual([{ nodeId: "n2", value: "Sunday" }]);
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.001,
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "unknown" } }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.001 } } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    };
    const instruction: AutomationStudioFlowInstruction = {
      schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: "Read the branch's Sunday opening time.",
      scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
    };
    await verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary, instructions: [instruction], deniedEvidenceKeys: DENIED, provider });
    expect((seen[0]?.context.resultSummary as { returned?: unknown } | undefined)?.returned).toEqual(summary.returned);
  });
});
