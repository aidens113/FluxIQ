// A stub-judge replay of A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`
// (t641) through the whole-candidate submission controller and trial gate, on
// the campsite search of `./kept-condition-fixture.ts`.
//
// Revision 1 writes every clause and stores exactly the campsites asked for.
// Both judges say no (trial 2's shape): call 1 names a gap and advises changing
// condition 1, every row of which, left out by itself, is another copy of a
// stored row; call 2 names only the gap. The no stands, call 1's reading
// carries Core's label for the part its record contradicts, and the gate keeps
// conditions 1 and 2, which Core's record shows left out only rows the request
// does not ask for. The next submission drops condition 1, as the run's
// revision 4 did: it is refused once, in Core's words naming the condition, as
// written, and the rows it kept out, and revision 1 still stands. Submitted
// again, the same drop is accepted. A revision keeping both conditions is
// never refused. No model is called; the provider is scripted.
//
// The last case sends that resend through the real authoring and evidence
// loops on one unchanged page, as A8 frozen pair 4 (`run-mva446jf-926a3c72`,
// 0044-0050) did: there the repeat guard refused the invited resend unrun as a
// repeat of the refusal three times and the build ended (t650).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioBuildTestVerdict } from "../../../../../result-verification/index.ts";
import { CAMP_CEDAR } from "../../../../../result-verification/refuted-no/tests/campsite-fixture.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE,
  AutomationStudioFlowCandidateSubmissionController,
  AutomationStudioFlowCandidateTrialGate,
  automationStudioCandidateSubmissionRefusal,
  runAutomationStudioFlowCandidateAuthoringLoop,
  type AutomationStudioCandidateTrialResult,
  type AutomationStudioFlowCandidate
} from "../../../index.ts";
import { CAMP_WHERE, GAP_AND_CHANGE_NO, GAP_NO, KEPT_CONDITION_SUBMISSION, campsiteJudging, campsiteReadScript as script } from "./kept-condition-fixture.ts";

const { promoted, open, rating, campground, notCabin } = CAMP_WHERE;

/** The trial's answer as the candidate trial service gives it (`../../../../../service/candidate-trial/run.ts`): the no's record beside the feedback. */
function answered(request: { revision: number; digest: string }, verdict: AutomationStudioBuildTestVerdict): AutomationStudioCandidateTrialResult {
  const base = { revision: request.revision, digest: request.digest };
  if (verdict.verdict === "no") return { ...base, verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { ...(verdict.observed ? { observed: verdict.observed } : {}), ...(verdict.advice ? { advice: verdict.advice } : {}) } }, ...(verdict.standingNo ? { standingNo: verdict.standingNo } : {}) } as AutomationStudioCandidateTrialResult;
  return { ...base, verdict: verdict.verdict === "yes" ? "yes" : "unsure", feedback: { code: "candidate.trial_unconfirmed" } };
}

function build(...diagnoses: Record<string, unknown>[]) {
  const controller = new AutomationStudioFlowCandidateSubmissionController(KEPT_CONDITION_SUBMISSION);
  const judge = campsiteJudging(...diagnoses);
  const gate = new AutomationStudioFlowCandidateTrialGate({
    latest: () => controller.latest(),
    trial: { candidateId: "candidate.campsites", port: async (request) => answered(request, await judge(request.candidate.buildPlan.plan.subflows)) }
  });
  const history = { trialOf: (candidate: Pick<AutomationStudioFlowCandidate, "revision" | "digest">) => gate.standing(candidate), refuted: (digest: string) => gate.refuted(digest) };
  const submit = (input: JsonObject) => controller.submit(input, history);
  const test = (candidate: AutomationStudioFlowCandidate) => gate.test({ revision: candidate.revision, digest: candidate.digest });
  return { controller, gate, submit, test };
}

async function accepted(submitted: ReturnType<ReturnType<typeof build>["submit"]>): Promise<AutomationStudioFlowCandidate> {
  const result = await submitted;
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  return result.candidate;
}

describe("a condition Core's record kept, dropped after a no on advice it refutes in part (t641)", () => {
  it("labels the advice, keeps the condition, refuses its drop once, and accepts the same drop sent again", async () => {
    const { controller, gate, submit, test } = build(GAP_AND_CHANGE_NO, GAP_NO);
    const exact = await accepted(submit(script([promoted, open, rating, campground, notCabin])));
    const trial = await test(exact);
    expect(trial.resultCode).toBe("candidate.trial_no");
    // The label shows: the advice Core's record contradicts says so, with Core's finding.
    const judged = ((trial.evidence as JsonObject).feedback as JsonObject).judge as JsonObject;
    expect(String(judged.advice)).toContain("Judge call 1 (Core's record contradicts part of this reading: Of the 2 rows condition 1 (promoted is absent)");
    // What the gate keeps rides outside the feedback a model is shown.
    expect(JSON.stringify(trial.evidence)).not.toContain("keptConditions");
    expect(gate.standing(exact)).toMatchObject({ keptConditions: [{ name: "condition 1 (promoted is absent)", revision: 1 }, { revision: 1 }] });

    // Revision 4's move: condition 1 dropped on that advice. Refused once.
    const dropped = await submit(script([open, rating, campground, notCabin]));
    expect(dropped.ok).toBe(false);
    if (dropped.ok) return;
    expect(dropped.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE]);
    const said = String(dropped.check.feedback?.instruction);
    expect(said).toContain(`Condition 1 (promoted is absent), as revision 1 wrote it (${JSON.stringify({ field: "promoted", is: "absent" })}), left out by itself only these 2 rows: "${CAMP_CEDAR.name}" (another copy of it is in the result)`);
    expect(said).toContain("submit the same change again: Core refuses this once, not twice");
    expect(said).not.toContain("ondition 2");
    expect(dropped.check.feedback).toMatchObject({ code: AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE, keptConditions: [{ condition: "condition 1 (promoted is absent)", revision: 1, written: promoted }] });
    // Counted under its own code, and the revision that stood still stands.
    const told = automationStudioCandidateSubmissionRefusal(dropped);
    expect(told.resultCode).toMatch(/^candidate\.kept_condition_dropped/u);
    // The model's next step is its own (round 2): Core's words, the revision that stands, and a hint it may override once.
    const next = String(told.evidence.next);
    expect(next).toContain("Condition 1 (promoted is absent), as revision 1 wrote it");
    expect(next).toContain("Nothing was made a new revision: revision 1, which stood before this submission, still stands.");
    expect(next).toContain("This refusal is a hint from Core's record, not a block: if you are sure the change is right, send the same change again and it is accepted.");
    expect(next).not.toContain("Correct every listed issue");
    expect(next).not.toContain("a third decision in a row ends this build");
    expect(next).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);
    expect(controller.matches(exact)).toBe(true);
    expect(said).not.toMatch(/\b(?:paper|towels?|holders?|pickup|retailer|valueridge|sponsored)\b/iu);

    // The same drop sent again: the model's considered choice, accepted.
    const again = await accepted(submit(script([open, rating, campground, notCabin])));
    expect(again.revision).toBe(3);
  });

  it("refuses a drop of each kept condition once: a later drop of the other is refused, naming it alone", async () => {
    const { submit, test } = build(GAP_AND_CHANGE_NO, GAP_NO);
    await test(await accepted(submit(script([promoted, open, rating, campground, notCabin]))));
    const first = await submit(script([open, rating, campground, notCabin]));
    expect(first).toMatchObject({ ok: false });
    if (first.ok) return;
    await accepted(submit(script([open, rating, campground, notCabin])));
    // Condition 2 loosened next (the run's revision 5): refused, naming it alone.
    const loosened = await submit(script([{ field: "availability", contains: "Open" }, rating, campground, notCabin]));
    expect(loosened.ok).toBe(false);
    if (loosened.ok) return;
    // Two hints about two conditions are two refusals, never one run that could end the build.
    expect(automationStudioCandidateSubmissionRefusal(loosened).resultCode).not.toBe(automationStudioCandidateSubmissionRefusal(first).resultCode);
    const said = String(loosened.check.feedback?.instruction);
    expect(said).toContain("Condition 2 (availability (read \"Open this weekend\" on a row it kept) contains [\"Open this weekend\"])");
    expect(said).toContain("fails the request's words");
    expect(said).not.toContain("Condition 1");
  });

  it("never refuses a revision that keeps every kept condition as written, in any order, with other changes", async () => {
    const { submit, test } = build(GAP_AND_CHANGE_NO, GAP_NO);
    await test(await accepted(submit(script([promoted, open, rating, campground, notCabin]))));
    await accepted(submit(script([open, { is: "absent", field: "promoted" }, rating, notCabin], 8)));
  });

  it("holds nothing where no trial's record kept a condition", async () => {
    const { submit } = build();
    await accepted(submit(script([promoted, open, rating, campground, notCabin])));
    await accepted(submit(script([rating])));
  });
});

type Entry = { callId: string; toolId: string; value: unknown };
type Decide = AutomationStudioLlmEvidenceLoopInput["decide"];

/** The page every call finds: nothing between the refusal and its resend moves it, as in the run. */
const PAGE = "page.campsites";
const look = { toolId: "demo.look", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const };
const call = (callId: string, toolId: string, input: JsonObject) => ({ kind: "tool_call" as const, callId, toolId, input });
const entry = (evidence: readonly Entry[], callId: string) => evidence.find((one) => one.callId === callId)?.value as JsonObject | undefined;

describe("the resend a kept-condition refusal invites, through the authoring and evidence loops (t650)", () => {
  it("is refused once with the mark, sent again word for word on the same page and revision, and accepted by the controller", async () => {
    const judge = campsiteJudging(GAP_AND_CHANGE_NO, GAP_NO);
    const dropped = script([open, rating, campground, notCabin]);
    let shown: readonly Entry[] = [];
    const accepted: number[] = [];
    const decide: Decide = async ({ iteration, evidence }) => {
      shown = evidence as readonly Entry[];
      const receipt = entry(shown, "submit-exact");
      if (iteration === 1) return call("look-1", look.toolId, {});
      if (iteration === 2) return call("submit-exact", "core.submit_candidate", script([promoted, open, rating, campground, notCabin]));
      if (iteration === 3) return call("test-1", "core.test_candidate", { revision: receipt!.revision as number, digest: receipt!.digest as string });
      if (iteration === 4) return call("look-2", look.toolId, { again: true });
      if (iteration === 5) return call("submit-drop", "core.submit_candidate", dropped);
      if (iteration === 6) return call("submit-again", "core.submit_candidate", { ...dropped, summary: "Same change, sent again as invited" });
      return { kind: "complete", result: { revision: 0, digest: "none" } };
    };
    await runAutomationStudioFlowCandidateAuthoringLoop({
      submission: KEPT_CONDITION_SUBMISSION,
      trial: { candidateId: "candidate.campsites", port: async (request) => answered(request, await judge(request.candidate.buildPlan.plan.subflows)) },
      accepted: (candidate) => accepted.push(candidate.revision),
      loop: {
        tools: [look], maxIterations: 8, maxToolCalls: 10,
        unusableDecisions: { maxConsecutive: 8, maxInARow: 8, stalled: () => new Error("stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: PAGE, after: PAGE }, evidence: { ok: true, sites: 12 }, effectApplied: false, draft: { actionId: "demo.look", effect: "observe", proposes: false } }),
        decide
      }
    });

    expect(entry(shown, "test-1")).toMatchObject({ ok: false });
    // The refusal: its own code, the mark the guard reads beside Core's feedback, and the revision that stood still stands.
    const refusal = entry(shown, "submit-drop")!;
    expect(refusal).toMatchObject({ ok: false, diagnostics: { code: AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE, resend: "accepted_once" } });
    // The resend ran: the controller accepted it as a new revision, and nothing refused it as a repeat.
    expect(entry(shown, "submit-again")).toMatchObject({ ok: true, revision: 3 });
    expect(accepted).toEqual([1, 3]);
    expect(JSON.stringify(shown)).not.toContain("llm_evidence_loop.repeat_refused");
  });
});
