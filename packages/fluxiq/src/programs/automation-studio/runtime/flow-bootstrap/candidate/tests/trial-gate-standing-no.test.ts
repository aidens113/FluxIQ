// The swing of A8 wave 8 (t633, bigbox `run-mv9gbsm5-2957581c`) through the
// whole-candidate trial gate, as `../../subflow-candidate/tests/standing-no-swing.test.ts`
// replays it through the subflow gate: a later no whose remedy would bring
// back the rows an earlier standing no of the build called not the asked kind
// is contradicted by the build's own record, the model is told so, and the
// exact Flow's re-test, judged yes twice, confirms it. Scripted provider, the
// campsite search of `../../../result-verification/standing-no-record/tests/campsite-swing-fixture.ts`.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import { campsiteInstruction } from "../../../result-verification/refuted-no/tests/campsite-fixture.ts";
import { CAMPSITE_YES, DROP_NAME_CONDITIONS_NO } from "../../../result-verification/refuted-no/tests/campsite-readings-fixture.ts";
import { CABIN_KEPT_NO, cabinKeptSummary, cabinLeftOutSummary } from "../../../result-verification/standing-no-record/tests/campsite-swing-fixture.ts";
import { AutomationStudioFlowCandidateTrialGate, type AutomationStudioCandidateTrialResult, type AutomationStudioFlowCandidate } from "../index.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const no = (reading: Record<string, string>) => ({ answersRequest: "no", ...reading });

const CABIN_KEPT = { revision: 1, digest: "c".repeat(64) } as AutomationStudioFlowCandidate;
const EXACT = { revision: 2, digest: "d".repeat(64) } as AutomationStudioFlowCandidate;
const receipt = (of: AutomationStudioFlowCandidate): JsonObject => ({ revision: of.revision, digest: of.digest });

/** The trial's answer as the candidate trial service gives it (`../../../service/candidate-trial/run.ts`): the no's record beside the feedback. */
function answered(request: { revision: number; digest: string }, verdict: AutomationStudioBuildTestVerdict): AutomationStudioCandidateTrialResult {
  const base = { revision: request.revision, digest: request.digest };
  if (verdict.verdict === "yes") return { ...base, verdict: "yes", feedback: { judge: "The trial was judged twice to do what the instruction asks." } };
  if (verdict.verdict === "no") return { ...base, verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { ...(verdict.observed ? { observed: verdict.observed } : {}), ...(verdict.advice ? { advice: verdict.advice } : {}) } }, ...(verdict.standingNo ? { standingNo: verdict.standingNo } : {}) } as AutomationStudioCandidateTrialResult;
  return { ...base, verdict: verdict.verdict === "unknown" ? "unsure" : "not_judged", feedback: { code: "candidate.trial_unconfirmed" } };
}

function swing(...diagnoses: Record<string, unknown>[]) {
  let latest = CABIN_KEPT;
  let calls = 0;
  const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: diagnoses[calls++] ?? {} }, usage: USAGE }) };
  const judge = automationStudioBuildTestJudge({ instructions: [campsiteInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });
  const gate = new AutomationStudioFlowCandidateTrialGate({
    latest: () => latest,
    trial: { candidateId: "candidate.swing", port: async (request) => answered(request, await judge({ summary: request.revision === 1 ? cabinKeptSummary() : cabinLeftOutSummary(), budget: { maxCostUsd: 0.2 } })) }
  });
  return { gate, calls: () => calls, submit: (next: AutomationStudioFlowCandidate) => { latest = next; } };
}

describe("an exclusion a standing no upheld holds across a build's whole-candidate trials (t633)", () => {
  it("weighs a later no whose remedy would bring back the rows it upheld as contradicted, tells the model, and the exact Flow is confirmed", async () => {
    const { gate, calls, submit } = swing(no(CABIN_KEPT_NO), no(CABIN_KEPT_NO), no(DROP_NAME_CONDITIONS_NO), no(DROP_NAME_CONDITIONS_NO), CAMPSITE_YES, CAMPSITE_YES);
    expect((await gate.test(receipt(CABIN_KEPT))).resultCode).toBe("candidate.trial_no");
    submit(EXACT);
    const second = await gate.test(receipt(EXACT));
    const evidence = second.evidence as JsonObject;
    expect(second).toMatchObject({ resultCode: "candidate.trial_unsure", resultReason: "retry_allowed" });
    expect(evidence).toMatchObject({ verdict: "unsure", retestsLeft: 2, feedback: { code: "candidate.trial_judged_no" } });
    expect(String((evidence.feedback as JsonObject).contradictedByBuild)).toContain("Revision 1, read without condition 4");
    const told = String(evidence.instruction);
    expect(told).toContain("Core's record of this build contradicts that no");
    expect(told).toContain("do not make the change that no asks for");
    expect(told).toContain("submit the whole candidate");
    expect(gate.refuted(EXACT.digest)).toBeUndefined();
    expect(gate.retestable()).toEqual({ revision: 2, digest: EXACT.digest, trials: 1 });
    expect(gate.completion(EXACT)).toMatchObject({ ok: false, issueCodes: ["candidate.trial_unsure"], feedback: { instruction: told } });
    expect(JSON.stringify(evidence)).not.toContain("Aspen Grove");
    expect((await gate.test(receipt(EXACT))).resultCode).toBe("candidate.trial_yes");
    expect(gate.completion(EXACT)).toEqual({ ok: true });
    expect(calls()).toBe(6);
  });

  it("leaves a no standing where no earlier no of the build upheld the rows its remedy would bring back", async () => {
    const { gate, submit } = swing(no(DROP_NAME_CONDITIONS_NO), no(DROP_NAME_CONDITIONS_NO));
    submit(EXACT);
    expect((await gate.test(receipt(EXACT))).resultCode).toBe("candidate.trial_no");
    expect(gate.refuted(EXACT.digest)).toBeDefined();
  });
});
