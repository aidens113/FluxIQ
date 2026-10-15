// A stub replay of A8 wave 8's swing (t633, bigbox `run-mv9gbsm5-2957581c`),
// through the subflow trial gate and the build-test judge a subflow trial
// asks, with a scripted provider, on the campsite search of
// `../../../result-verification/standing-no-record/tests/campsite-swing-fixture.ts`:
// revision 1 stores a rental cabin and its no, calling the cabin not a
// campsite, stands; revision 2 leaves the cabin out by two name conditions
// together and stores exactly the campsites asked for, and its judges say no,
// asking to remove those two conditions. That no is contradicted by the build's
// own record: the trial is unsure, revision 2 is not closed, the builder is
// told why, and its re-test, judged yes twice, confirms the exact subflow.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import { campsiteInstruction } from "../../../result-verification/refuted-no/tests/campsite-fixture.ts";
import { CAMPSITE_YES, DROP_NAME_CONDITIONS_NO } from "../../../result-verification/refuted-no/tests/campsite-readings-fixture.ts";
import { CABIN_KEPT_NO, cabinKeptSummary, cabinLeftOutSummary } from "../../../result-verification/standing-no-record/tests/campsite-swing-fixture.ts";
import { AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { testScope } from "./subflow-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const no = (reading: Record<string, string>) => ({ answersRequest: "no", ...reading });

const scope = testScope();
const identity = { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey };
const proposal = (revision: number, digest: string): AutomationStudioSubflowProposal => ({ scope: identity, revision, digest, subflows: [], summary: "Find campsites", changedPaths: [] });
const CABIN_KEPT = proposal(1, "a".repeat(64));
const EXACT = proposal(2, "b".repeat(64));
const receipt = (of: AutomationStudioSubflowProposal): JsonObject => ({ revision: of.revision, digest: of.digest });

/** A provider answering each call with its own diagnosis, counting the calls. */
function answering(...diagnoses: Record<string, unknown>[]): { provider: AutomationStudioLlmProvider; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    provider: { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: diagnoses[calls++] ?? {} }, usage: USAGE }) }
  };
}

/** The trial's answer as the subflow trial service gives it (`../../../service/subflow-trial/run.ts`): the no's record beside the feedback. */
function answered(request: AutomationStudioSubflowTrialRequest, verdict: AutomationStudioBuildTestVerdict): AutomationStudioSubflowTrialResult {
  const base = { partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, entryPrepared: true };
  if (verdict.verdict === "yes") return { ...base, verdict: "yes", feedback: { judge: "The trial was judged twice to do what the instruction asks." } };
  if (verdict.verdict === "no") return { ...base, verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { ...(verdict.observed ? { observed: verdict.observed } : {}), ...(verdict.advice ? { advice: verdict.advice } : {}) } }, ...(verdict.standingNo ? { standingNo: verdict.standingNo } : {}) } as AutomationStudioSubflowTrialResult;
  return { ...base, verdict: verdict.verdict === "unknown" ? "unsure" : "not_judged", feedback: { code: "candidate.trial_unconfirmed" } };
}

/** A gate whose port judges each revision's run with the build-test judge: revision 1 stored the cabin, revision 2 the campsites alone. */
function swing(...diagnoses: Record<string, unknown>[]) {
  let latest = CABIN_KEPT;
  const scripted = answering(...diagnoses);
  const judge = automationStudioBuildTestJudge({ instructions: [campsiteInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider: scripted.provider });
  const gate = new AutomationStudioSubflowTrialGate({
    scope, latest: () => structuredClone(latest),
    port: async (request) => answered(request, await judge({ summary: request.proposal.revision === 1 ? cabinKeptSummary() : cabinLeftOutSummary(), budget: { maxCostUsd: 0.2 } }))
  });
  return { gate, calls: scripted.calls, submit: (next: AutomationStudioSubflowProposal) => { latest = next; } };
}

describe("an exclusion a standing no upheld holds across a brief's trials (t633)", () => {
  it("weighs a later no whose remedy would bring back the rows it upheld as contradicted, tells the builder, and the exact subflow is confirmed", async () => {
    const { gate, calls, submit } = swing(no(CABIN_KEPT_NO), no(CABIN_KEPT_NO), no(DROP_NAME_CONDITIONS_NO), no(DROP_NAME_CONDITIONS_NO), CAMPSITE_YES, CAMPSITE_YES);
    // Revision 1: the cabin kept, and the no calling it not a campsite stands.
    const first = await gate.test(receipt(CABIN_KEPT));
    expect(first.resultCode).toBe("subflow.trial_no");
    expect(gate.refuted(CABIN_KEPT.digest)).toBeDefined();

    // Revision 2: exactly the campsites; the no asking to remove the conditions that left the cabin out is not taken.
    submit(EXACT);
    const second = await gate.test(receipt(EXACT));
    const evidence = second.evidence as JsonObject;
    expect(second.resultCode).toBe("subflow.trial_unsure");
    expect(second.resultReason).toBe("retry_allowed");
    expect(evidence).toMatchObject({ verdict: "unsure", retestsLeft: 2 });
    const feedback = evidence.feedback as JsonObject;
    // The judge's no is still there to read, its code first; Core's words beside it.
    expect(feedback.code).toBe("candidate.trial_judged_no");
    expect(String(feedback.contradictedByBuild)).toContain("Revision 1, read without condition 4");
    expect(String(feedback.contradictedByBuild)).toContain("this no is not taken");
    const told = String(evidence.instruction);
    expect(told).toContain("Core's record of this build contradicts that no");
    expect(told).toContain("Test this same revision again");
    expect(told).toContain("do not make the change that no asks for");
    // Not closed: nothing refuses the re-test or a completion after a yes.
    expect(gate.refuted(EXACT.digest)).toBeUndefined();
    expect(gate.completion(EXACT)).toMatchObject({ ok: false, issueCodes: ["subflow.trial_unsure"], feedback: { instruction: told } });
    // Core's record never reaches what the builder is shown.
    expect(JSON.stringify(second.evidence)).not.toContain("upheldKind");
    expect(JSON.stringify(second.evidence)).not.toContain("Aspen Grove");

    // The re-test of revision 2, judged yes twice, confirms the exact subflow.
    const third = await gate.test(receipt(EXACT));
    expect(third.resultCode).toBe("subflow.trial_yes");
    expect(gate.completion(EXACT)).toEqual({ ok: true });
    expect(calls()).toBe(6);
  });

  it("leaves a no standing where no earlier no of the brief upheld the rows its remedy would bring back", async () => {
    const { gate, submit } = swing(no(DROP_NAME_CONDITIONS_NO), no(DROP_NAME_CONDITIONS_NO));
    submit(EXACT);
    const ran = await gate.test(receipt(EXACT));
    expect(ran.resultCode).toBe("subflow.trial_no");
    expect(gate.refuted(EXACT.digest)).toBeDefined();
  });

  it("is said in words naming no site, task or product", async () => {
    const { gate, submit } = swing(no(CABIN_KEPT_NO), no(CABIN_KEPT_NO), no(DROP_NAME_CONDITIONS_NO), no(DROP_NAME_CONDITIONS_NO));
    await gate.test(receipt(CABIN_KEPT));
    submit(EXACT);
    const evidence = (await gate.test(receipt(EXACT))).evidence as JsonObject;
    const said = `${String(evidence.instruction)} ${String((evidence.feedback as JsonObject).contradictedByBuild).replace(/condition \d+ \([^)]*\)/gu, "condition")}`;
    expect(said).not.toMatch(/\b(?:paper|towels?|holders?|pickup|packs?|retailer|valueridge|cabins?|campsites?|campground)\b/iu);
  });
});
