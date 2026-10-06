// The repair brief carries Core's check of the rows the check names (t274-c25b).
// Live run `run-muw60j7c-bb7c9a62`, step 0039: the result judge said the Plus
// condition "alone excluded" B0J5MCMBAY and B07Z1RZGJG, though both are in the
// stored result, and advised fixing that condition. Core's check said so
// (`../../../result-verification/request-rows/checked-rows.ts`), but nothing
// read it: the re-author got the advice unmarked and threw away the answer.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { verifyAutomationStudioRunResult } from "../../../result-verification/index.ts";
import { RUN_MUW60J7C_FILTERED_READ, RUN_MUW60J7C_REQUEST, RUN_MUW60J7C_RESULT_JUDGE, runMuw60j7cRunSummary } from "../../../result-verification/request-rows/tests/run-muw60j7c.ts";
import { automationStudioReauthorBrief } from "../brief.ts";
import { automationStudioResultRepairHistoryEntry } from "../history.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Evidence-guided generation goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

const provider: AutomationStudioLlmProvider = {
  metadata: { provider: "mock", model: "debug-model" },
  runTask: async (_request: AutomationStudioLlmTaskRequest) => ({ response: { kind: "diagnosis", summary: RUN_MUW60J7C_RESULT_JUDGE.summary, diagnosis: RUN_MUW60J7C_RESULT_JUDGE.diagnosis }, usage: USAGE }) as never
};

/** The brief the re-author of step 0039's refutation is given, from the real verification. */
async function brief(): Promise<{ body: string; checked: string[] }> {
  const summary = runMuw60j7cRunSummary();
  const report = await verifyAutomationStudioRunResult({ projectId: "project-1", flowId: "flow-1", runId: "run-1", summary, instructions: [instruction], deniedEvidenceKeys: [], provider });
  const current = automationStudioResultRepairHistoryEntry({ attempt: 1, outcome: report.outcome, summary, nodeId: RUN_MUW60J7C_FILTERED_READ });
  const body = automationStudioReauthorBrief({ projectId: "project-1", flowId: "flow-1", current, history: [], maxAttempts: 3, now: 5 }).body;
  return { body, checked: current.directive?.checked ?? [] };
}

describe("the repair brief, on Core's check of the rows the check names", () => {
  it("carries every checked line, marked as Core's, among what the last run produced", async () => {
    const { body, checked } = await brief();
    expect(checked.length).toBeGreaterThan(0);
    const before = body.indexOf("What to do:");
    for (const line of checked) {
      const at = body.indexOf(`- Core checked the rows the check names: ${line}`);
      expect(at, line).toBeGreaterThan(-1);
      expect(at).toBeLessThan(before);
    }
    expect(body).toContain("(B0J5MCMBAY) is in the result, although the check calls it left out");
    expect(body).toContain("(B07Z1RZGJG) is in the result, although the check calls it left out");
    // Core's check comes before the check's own advice, which it qualifies.
    expect(body.indexOf("- Core checked the rows the check names:")).toBeLessThan(body.indexOf("- The check's advice:"));
  });

  it("says in step 3 that advice resting on a row Core lists as in the result is not followed, and a condition really leaving out a wanted row is corrected", async () => {
    const { body } = await brief();
    const step3 = body.split("\n").find((line) => line.startsWith("3. ")) ?? "";
    expect(step3).toContain("advice resting on a row Core lists as in the result although the check calls it left out is not followed");
    expect(step3).toContain("a condition Core lists as really leaving out a row the request wants is the one to correct");
    // The t194-w78 sentence stays.
    expect(step3).toContain("Core's account stands and that part of the advice is not followed");
  });
});
