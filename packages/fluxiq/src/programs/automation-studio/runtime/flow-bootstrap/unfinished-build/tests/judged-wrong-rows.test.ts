// A build's test judged wrong reaches the next round with the rows (t274-c25b).
// Live run `run-muw60j7c-bb7c9a62`, step 0031: both judges of the test said yes
// over three pairs of earbuds the name condition alone left out for mentioning
// a charging case. Core now takes such a yes as a no (`result-verification/verdict.ts`),
// and the build's repair round must be told which rows -- Core's fix lines and
// its check of them -- not only the finding code `judgedWrong` used to keep.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
// The judge before the evidence loop: the loop's barrel, loaded first, reaches
// the judge's harness through a cycle before that harness is defined.
import { automationStudioBuildTestJudge, type AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioLlmEvidenceResumeEntry } from "../../../llm/evidence-loop/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { RUN_MUW60J7C_PAIRS_LEFT_OUT, RUN_MUW60J7C_REQUEST, RUN_MUW60J7C_TEST_JUDGE, RUN_MUW60J7C_TEST_READS, runMuw60j7cTestSummary } from "../../../result-verification/request-rows/tests/run-muw60j7c.ts";
import type { AutomationStudioFlowBootstrapTestVerdict } from "../contracts.ts";
import { automationStudioFlowBootstrapJudgeFinished, automationStudioFlowBootstrapJudgementValue } from "../judgement.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Evidence-guided generation goal", body: RUN_MUW60J7C_REQUEST,
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

const provider: AutomationStudioLlmProvider = {
  metadata: { provider: "mock", model: "debug-model" },
  runTask: async (_request: AutomationStudioLlmTaskRequest) => ({ response: { kind: "diagnosis", summary: RUN_MUW60J7C_TEST_JUDGE.summary, diagnosis: RUN_MUW60J7C_TEST_JUDGE.diagnosis }, usage: USAGE }) as never
};

/** The test step 0031 judged, with what its Flow would store: both reads appended to one dataset. */
function testSummary(): AutomationStudioRunResultSummary {
  const summary = runMuw60j7cTestSummary();
  const labels = RUN_MUW60J7C_TEST_READS.flatMap((read) => (read.observed as { readRows?: { rows?: string[] } }).readRows?.rows ?? []);
  summary.buildTest = { ...summary.buildTest!, stores: [{ dataset: "web.output.dom-extract_list", writeMode: "append", steps: [9, 10], rows: labels.length, labels }] };
  return summary;
}

/** A step the round left in its Flow. */
function step(position: number): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `c${position}`, actionId: "web.dom.click", input: {}, effect: "mutate", effectApplied: true, disposition: "kept",
    ranWith: { target: `t${position}` }, replay: { from: { at: "start" } }
  };
}

/** The next round's reading of the judged-wrong test, as the build's judge and judgement give it. */
async function nextRound(steps: AutomationStudioFlowDraftStep[] = [step(1), step(2)]): Promise<{ verdict: AutomationStudioFlowBootstrapTestVerdict; records: unknown; judge: Record<string, unknown>; instruction: string }> {
  const verdict: AutomationStudioFlowBootstrapTestVerdict = await automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider })({ summary: testSummary(), budget: { maxCostUsd: 0.2 } });
  if (verdict.verdict === "yes") throw new Error("Core took the yes that passed over the rows");
  const { judgement } = automationStudioFlowBootstrapJudgeFinished({ round: 1, steps, verdict, checklist: () => undefined });
  const value = automationStudioFlowBootstrapJudgementValue(judgement);
  const entry = automationStudioLlmEvidenceResumeEntry({ revision: 2, stopped: "judged_wrong", outstandingIssueCodes: [], judgement: value }, steps);
  return { verdict, records: judgement.judge?.records, judge: value.judge as Record<string, unknown>, instruction: String(entry.value.instruction) };
}

describe("a downgraded build-test yes, as the next round reads it", () => {
  it("carries Core's fix lines and its check, naming each pair the name condition left out", async () => {
    const { judge, records } = await nextRound();
    expect(judge.verdict).toBe("no");
    const fix = (judge.fix as string[] | undefined ?? []).join("\n");
    const checked = (judge.checked as string[] | undefined ?? []).join("\n");
    for (const row of RUN_MUW60J7C_PAIRS_LEFT_OUT) {
      expect(fix).toContain(row);
      expect(checked).toContain(row);
    }
    // The same rows in structured form, per read and condition (live run `run-mux6naez-6c20f26e`, R3-3): what a rerun of the read is compared with.
    expect(judge.checkedRows).toEqual([{ step: 10, condition: "name", rows: RUN_MUW60J7C_PAIRS_LEFT_OUT.map((label) => ({ label })) }]);
    // What the Flow would store, which the next repair's progress is measured against (`../progress.ts`).
    expect(records).toEqual({ stored: 30, refused: 0, missingRequired: 0 });
  });

  it("is told what Core's fix and check are, and how they weigh against the judge's advice, whether or not the Flow holds steps", async () => {
    for (const steps of [[step(1), step(2)], []]) {
      const { instruction: said } = await nextRound(steps);
      expect(said, `${steps.length} steps`).toContain("judgement.judge.fix");
      expect(said, `${steps.length} steps`).toContain("judgement.judge.checked");
      expect(said, `${steps.length} steps`).toContain("is not followed");
    }
  });
});
