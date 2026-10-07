// What a build's judged-wrong test carries to its repair (t274-c25b), from live
// run `run-muw60j7c-bb7c9a62`: both judges of the test (step 0031) said yes over
// three pairs of earbuds the name condition alone left out for mentioning a
// charging case. Core now takes such a yes as a no (`../../verdict.ts`); the
// build's repair must then be told the rows, not only the finding code, and
// what the Flow would store -- 20 unfiltered rows from step 9 and 10 filtered
// rows from step 10, appended to one dataset -- not the 0 a test stores itself.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../../repair-directive.ts";
import { RUN_MUW60J7C_PAIRS_LEFT_OUT, RUN_MUW60J7C_REQUEST, RUN_MUW60J7C_TEST_JUDGE, RUN_MUW60J7C_TEST_READS, runMuw60j7cTestSummary } from "../../request-rows/tests/run-muw60j7c.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Evidence-guided generation goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

/** The labels a replayed read named, in order. */
function readLabels(step: number): string[] {
  const observed = RUN_MUW60J7C_TEST_READS.find((read) => read.step === step)?.observed as { readRows?: { rows?: string[] } } | undefined;
  return [...(observed?.readRows?.rows ?? [])];
}

/** The test step 0031 judged, with what its Flow would store: both reads appended to one dataset. */
function testSummary(): AutomationStudioRunResultSummary {
  const summary = runMuw60j7cTestSummary();
  const labels = [...readLabels(9), ...readLabels(10)];
  summary.buildTest = { ...summary.buildTest!, stores: [{ dataset: "web.output.dom-extract_list", writeMode: "append", steps: [9, 10], passes: 2, collected: labels.length, answer: { rows: labels.length, labels } }] };
  return summary;
}

/** A provider that answers every call with the run's own yes. */
function sayingYes(): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (_request: AutomationStudioLlmTaskRequest) => ({ response: { kind: "diagnosis", summary: RUN_MUW60J7C_TEST_JUDGE.summary, diagnosis: RUN_MUW60J7C_TEST_JUDGE.diagnosis }, usage: USAGE }) as never
  };
}

const judged = () => automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider: sayingYes() })({ summary: testSummary(), budget: { maxCostUsd: 0.2 } });

describe("a build test's yes Core did not take, as the build's no", () => {
  it("counts what the Flow would store (20 + 10 = 30), not the 0 the test itself stored", async () => {
    expect(readLabels(9)).toHaveLength(20);
    expect(readLabels(10)).toHaveLength(10);
    const verdict = await judged();
    expect(verdict).toMatchObject({ verdict: "no", records: { stored: 30, refused: 0, missingRequired: 0 } });
  });

  it("carries Core's fix lines naming the rows, and not the stored-run line a test cannot answer", async () => {
    const verdict = await judged();
    if (verdict.verdict !== "no") throw new Error(`expected no, got ${verdict.verdict}`);
    expect(verdict.findings).toContain(AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem);
    const fix = (verdict.fix ?? []).join("\n");
    for (const row of RUN_MUW60J7C_PAIRS_LEFT_OUT) expect(fix).toContain(row);
    expect(fix).toContain("\"name\"");
    // A test stores nothing by design: "add or fix the step that stores" is a finished run's fix, never a test's.
    expect(fix).not.toContain("no record set exists");
    expect(verdict.checked?.join("\n")).toContain(RUN_MUW60J7C_PAIRS_LEFT_OUT[0]);
  });
});

// The rows the check named, in structured form beside its lines (live run
// `run-mux6naez-6c20f26e`, R3-3): what the repair compares a rerun of the read with.
describe("a build test's no carries the rows Core's check named, per read and condition", () => {
  const named = [{ step: 10, condition: "name", rows: RUN_MUW60J7C_PAIRS_LEFT_OUT.map((label) => ({ label })) }];

  it("from a yes Core did not take", async () => {
    const verdict = await judged();
    if (verdict.verdict !== "no") throw new Error(`expected no, got ${verdict.verdict}`);
    expect(verdict.checkedRows).toEqual(named);
  });

  it("from a no whose judgement names the rows, beside its checked lines", async () => {
    const sayingNo: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (_request: AutomationStudioLlmTaskRequest) => ({
        response: {
          kind: "diagnosis", summary: "The name condition is too broad.",
          diagnosis: { ...RUN_MUW60J7C_TEST_JUDGE.diagnosis, answersRequest: "no", observed: `The name condition alone left out earbuds, not accessories: ${RUN_MUW60J7C_PAIRS_LEFT_OUT.join("; ")}.`, changed: "Narrow the name exclusion." }
        },
        usage: USAGE
      }) as never
    };
    const verdict = await automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider: sayingNo })({ summary: testSummary(), budget: { maxCostUsd: 0.2 } });
    if (verdict.verdict !== "no") throw new Error(`expected no, got ${verdict.verdict}`);
    expect(verdict.checked?.join("\n")).toContain(`Step 10: the condition "name" alone left out these rows the check names: ${RUN_MUW60J7C_PAIRS_LEFT_OUT[0]}`);
    expect(verdict.checkedRows).toEqual(named);
  });
});
