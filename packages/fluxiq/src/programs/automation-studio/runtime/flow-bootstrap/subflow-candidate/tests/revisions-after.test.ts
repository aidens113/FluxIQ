// A brief's revisions are numbered on from the earlier brief's revision it
// starts from (A8 towels `run-mvac0nmw`, t658). A repair builder was shown its
// subflow at "revision 3" of an earlier brief, its own first proposal was
// revision 1, and it spent four decisions testing revision 3 before it saw the
// two were not the same. With `revisionsAfter`, a brief starting from revision
// 3 makes revision 4 first; a test of revision 3 is refused as stale, naming
// this brief's own latest and saying 3 was the earlier brief's; and every
// revision a refusal names is on this brief's numbering.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE, automationStudioCandidateSubmissionRefusal } from "../../candidate/index.ts";
import { CAMP_WHERE, GAP_AND_CHANGE_NO, GAP_NO, KEPT_CONDITION_SUBMISSION, campsiteJudging, campsiteReadScript } from "../../candidate/tests/kept-condition/tests/kept-condition-fixture.ts";
import type { AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import { AutomationStudioSubflowScopedSubmissionController, AutomationStudioSubflowTrialGate, type AutomationStudioSubflowProposal, type AutomationStudioSubflowTrialRequest, type AutomationStudioSubflowTrialResult } from "../index.ts";
import { OPEN, SIBLINGS, callPart, part, script, testScope, testSubmission } from "./subflow-fixture.ts";

const scope = testScope();

function yes(request: AutomationStudioSubflowTrialRequest): AutomationStudioSubflowTrialResult {
  return { partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: "yes", feedback: { said: "ok" }, entryPrepared: true };
}

async function proposed(submitted: Promise<Awaited<ReturnType<AutomationStudioSubflowScopedSubmissionController["submit"]>>>): Promise<AutomationStudioSubflowProposal> {
  const result = await submitted;
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  return result.proposal;
}

describe("a brief that starts from an earlier brief's revision 3", () => {
  it("numbers its first accepted revision 4, and a test of revision 3 is refused naming its own latest", async () => {
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: testSubmission(), revisionsAfter: 3 });
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => controller.latest(), port: async (request) => yes(request), revisionsAfter: 3 });
    const first = await proposed(controller.submit(script([...OPEN, ...callPart(), ...part()])));
    expect(first.revision).toBe(4);
    expect(controller.matches({ revision: 4, digest: first.digest })).toBe(true);

    const stale = await gate.test({ revision: 3, digest: first.digest });
    expect(stale.resultCode).toBe("subflow.trial_stale_revision");
    expect(stale.evidence).toMatchObject({ latestRevision: 4, latestDigest: first.digest, earlierRevision: 3 });
    expect(String((stale.evidence as JsonObject).instruction)).toContain("Revision 3 is not one of this brief's: it is an earlier brief's");
    expect((await gate.test({ revision: 4, digest: first.digest })).resultCode).toBe("subflow.trial_yes");
    expect(gate.completion({ revision: 4, digest: first.digest })).toEqual({ ok: true });

    const second = await proposed(controller.submit(script([...OPEN, ...callPart("refine"), ...part("refine")])));
    expect(second.revision).toBe(5);
    // A stale test of this brief's own older revision says nothing of an earlier brief.
    const own = await gate.test({ revision: 4, digest: first.digest });
    expect(own.evidence).toMatchObject({ latestRevision: 5 });
    expect(own.evidence).not.toHaveProperty("earlierRevision");
  });

  it("names this brief's revisions in a refusal: an unchanged resubmission says revision 4, not 1", async () => {
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: testSubmission(), revisionsAfter: 3 });
    const sent = script([...OPEN, ...callPart(), ...part()]);
    await proposed(controller.submit(sent));
    const again = await controller.submit(sent);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.revision).toBe(4);
    expect(again.check.feedback).toMatchObject({ unchanged: true, revision: 4 });
    expect(String(again.check.feedback?.instruction)).toContain("this is the Flow of revision 4");
    expect(String(again.check.feedback?.instruction)).not.toContain("revision 1");
  });

  it("holds a kept condition on this brief's numbering: refused naming revision 4 as standing, and the resend accepted", async () => {
    const { promoted, open, rating, campground, notCabin } = CAMP_WHERE;
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: KEPT_CONDITION_SUBMISSION, revisionsAfter: 3 });
    const judge = campsiteJudging(GAP_AND_CHANGE_NO, GAP_NO);
    const answered = (request: AutomationStudioSubflowTrialRequest, verdict: AutomationStudioBuildTestVerdict): AutomationStudioSubflowTrialResult => {
      const base = { partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, entryPrepared: true };
      if (verdict.verdict === "no") return { ...base, verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { ...(verdict.advice ? { advice: verdict.advice } : {}) } }, ...(verdict.standingNo ? { standingNo: verdict.standingNo } : {}) } as AutomationStudioSubflowTrialResult;
      return { ...base, verdict: verdict.verdict === "yes" ? "yes" : "unsure", feedback: { code: "candidate.trial_unconfirmed" } };
    };
    const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => controller.latest(), port: async (request) => answered(request, await judge(request.proposal.subflows)), revisionsAfter: 3 });
    const history = { trialOf: (proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest">) => gate.standing(proposal), refuted: (digest: string) => gate.refuted(digest) };
    const exact = await proposed(controller.submit(campsiteReadScript([promoted, open, rating, campground, notCabin]), history));
    expect(exact.revision).toBe(4);
    await gate.test({ revision: exact.revision, digest: exact.digest });
    const kept = (gate.standing(exact) as { keptConditions?: Array<{ revision: number }> }).keptConditions ?? [];
    expect(kept.length).toBeGreaterThan(0);
    for (const condition of kept) expect(condition.revision).toBe(4);

    const dropped = await controller.submit(campsiteReadScript([open, rating, campground, notCabin]), history);
    expect(dropped.ok).toBe(false);
    if (dropped.ok) return;
    expect(dropped.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE]);
    expect(String(dropped.check.feedback?.instruction)).toContain("as revision 4 wrote it");
    expect(dropped.check.feedback).toMatchObject({ standingRevision: { revision: 4 } });
    for (const condition of dropped.check.feedback!.keptConditions as JsonObject[]) expect(condition.revision).toBe(4);
    expect(String(automationStudioCandidateSubmissionRefusal(dropped).evidence.next)).toContain("revision 4, which stood before this submission, still stands");

    // Refused once, on the candidate controller's own numbering underneath: the same drop sent again is accepted, as revision 6.
    const again = await proposed(controller.submit(campsiteReadScript([open, rating, campground, notCabin]), history));
    expect(again.revision).toBe(6);
  });

  it("numbers from 1 when it starts from nothing", async () => {
    const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: testSubmission() });
    expect((await proposed(controller.submit(script([...OPEN, ...callPart(), ...part()])))).revision).toBe(1);
    expect(() => new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: testSubmission(), revisionsAfter: -1 })).toThrow("subflow.scope_invalid");
  });
});
