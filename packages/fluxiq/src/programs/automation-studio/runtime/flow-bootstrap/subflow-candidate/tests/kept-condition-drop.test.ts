// The whole-candidate replay of A8 wave 14 candidate towels
// `run-mv9ul5dy-e9a1b1c1` (t641, `../../candidate/tests/kept-condition-drop.test.ts`)
// through a brief's scoped submission controller and the subflow trial gate:
// a proposal judged no keeps the conditions Core's record showed leave out
// only rows the request does not ask for, the next proposal dropping one is
// refused once, in Core's words and naming the builder's own tools' subject,
// and the same drop sent again is accepted. Scripted provider, the campsite
// search of `../../candidate/tests/kept-condition-fixture.ts`.
//
// The last case sends that resend through the builder's own loop and the
// evidence loop on one unchanged page, the shape of A8 frozen pair 4
// (`run-mva446jf-926a3c72`, 0044-0050), where the repeat guard refused the
// invited resend unrun three times and the build ended (t650).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioBuildTestVerdict } from "../../../result-verification/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE, automationStudioCandidateSubmissionRefusal } from "../../candidate/index.ts";
import { CAMP_WHERE, GAP_AND_CHANGE_NO, GAP_NO, KEPT_CONDITION_SUBMISSION, campsiteJudging, campsiteReadScript as script } from "../../candidate/tests/kept-condition-fixture.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID,
  AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID,
  AutomationStudioSubflowScopedSubmissionController,
  AutomationStudioSubflowTrialGate,
  runAutomationStudioSubflowBuilderLoop,
  type AutomationStudioSubflowProposal,
  type AutomationStudioSubflowTrialRequest,
  type AutomationStudioSubflowTrialResult
} from "../index.ts";
import { SIBLINGS, testScope } from "./subflow-fixture.ts";

const { promoted, open, rating, campground, notCabin } = CAMP_WHERE;
const scope = testScope();

/** The trial's answer as the subflow trial service gives it (`../../../service/subflow-trial/run.ts`): the no's record beside the feedback. */
function answered(request: AutomationStudioSubflowTrialRequest, verdict: AutomationStudioBuildTestVerdict): AutomationStudioSubflowTrialResult {
  const base = { partial: true as const, scope: "subflow" as const, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, entryPrepared: true };
  if (verdict.verdict === "no") return { ...base, verdict: "no", feedback: { code: "candidate.trial_judged_no", judge: { ...(verdict.advice ? { advice: verdict.advice } : {}) } }, ...(verdict.standingNo ? { standingNo: verdict.standingNo } : {}) } as AutomationStudioSubflowTrialResult;
  return { ...base, verdict: verdict.verdict === "yes" ? "yes" : "unsure", feedback: { code: "candidate.trial_unconfirmed" } };
}

function brief(...diagnoses: Record<string, unknown>[]) {
  const controller = new AutomationStudioSubflowScopedSubmissionController({ scope, siblings: [...SIBLINGS], submission: KEPT_CONDITION_SUBMISSION });
  const judge = campsiteJudging(...diagnoses);
  const gate = new AutomationStudioSubflowTrialGate({ scope, latest: () => controller.latest(), port: async (request) => answered(request, await judge(request.proposal.subflows)) });
  const history = { trialOf: (proposal: Pick<AutomationStudioSubflowProposal, "revision" | "digest">) => gate.standing(proposal), refuted: (digest: string) => gate.refuted(digest) };
  return { gate, submit: (input: JsonObject) => controller.submit(input, history) };
}

async function proposed(submitted: ReturnType<ReturnType<typeof brief>["submit"]>): Promise<AutomationStudioSubflowProposal> {
  const result = await submitted;
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("refused");
  return result.proposal;
}

describe("a brief's condition Core's record kept, dropped after a no on advice it refutes in part (t641)", () => {
  it("is kept by the subflow gate, its drop refused once, and the same drop sent again accepted", async () => {
    const { gate, submit } = brief(GAP_AND_CHANGE_NO, GAP_NO);
    const exact = await proposed(submit(script([promoted, open, rating, campground, notCabin])));
    const trial = await gate.test({ revision: exact.revision, digest: exact.digest });
    expect(trial.resultCode).toBe("subflow.trial_no");
    expect(String((((trial.evidence as JsonObject).feedback as JsonObject).judge as JsonObject).advice)).toContain("Judge call 1 (Core's record contradicts part of this reading:");
    expect(JSON.stringify(trial.evidence)).not.toContain("keptConditions");
    expect(gate.standing(exact)).toMatchObject({ keptConditions: [{ name: "condition 1 (promoted is absent)" }, { revision: exact.revision }] });

    const dropped = await submit(script([open, rating, campground, notCabin]));
    expect(dropped.ok).toBe(false);
    if (dropped.ok) return;
    expect(dropped.check.issueCodes).toEqual([AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE]);
    const said = String(dropped.check.feedback?.instruction);
    expect(said).toContain("Condition 1 (promoted is absent), as revision 1 wrote it");
    expect(said).toContain("this subflow no longer writes it as it was written");
    expect(said).toContain("submit the whole subflow again");
    // The builder's next step, as its loop sends a refusal (`../builder-loop.ts`): its own, never the general advice.
    const next = String(automationStudioCandidateSubmissionRefusal(dropped).evidence.next);
    expect(next).toContain(`revision ${exact.revision}, which stood before this submission, still stands`);
    expect(next).toContain("not a block: if you are sure the change is right, send the same change again and it is accepted");
    expect(next).not.toContain("Correct every listed issue");

    const again = await proposed(submit(script([open, rating, campground, notCabin])));
    expect(again.revision).toBeGreaterThan(exact.revision);
  });
});

type Entry = { callId: string; toolId: string; value: unknown };
type Decide = AutomationStudioLlmEvidenceLoopInput["decide"];

/** The page every call finds: nothing between the refusal and its resend moves it, as in the run. */
const PAGE = "page.campsites";
const look = { toolId: "demo.look", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const };
const call = (callId: string, toolId: string, input: JsonObject) => ({ kind: "tool_call" as const, callId, toolId, input });
const entry = (evidence: readonly Entry[], callId: string) => evidence.find((one) => one.callId === callId)?.value as JsonObject | undefined;

describe("the resend a brief's kept-condition refusal invites, through the builder and evidence loops (t650)", () => {
  it("is refused once with the mark, sent again word for word on the same page, and accepted as a new proposal", async () => {
    const judge = campsiteJudging(GAP_AND_CHANGE_NO, GAP_NO);
    const dropped = script([open, rating, campground, notCabin]);
    let shown: readonly Entry[] = [];
    const accepted: number[] = [];
    const decide: Decide = async ({ iteration, evidence }) => {
      shown = evidence as readonly Entry[];
      const receipt = entry(shown, "submit-exact");
      if (iteration === 1) return call("look-1", look.toolId, {});
      if (iteration === 2) return call("submit-exact", AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, script([promoted, open, rating, campground, notCabin]));
      if (iteration === 3) return call("test-1", AUTOMATION_STUDIO_SUBFLOW_TEST_TOOL_ID, { revision: receipt!.revision as number, digest: receipt!.digest as string });
      if (iteration === 4) return call("look-2", look.toolId, { again: true });
      if (iteration === 5) return call("submit-drop", AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, dropped);
      if (iteration === 6) return call("submit-again", AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, dropped);
      return { kind: "complete", result: { subflowKey: scope.subflowKey, revision: 0, digest: "none" } };
    };
    await runAutomationStudioSubflowBuilderLoop({
      scope, siblings: [...SIBLINGS], submission: KEPT_CONDITION_SUBMISSION,
      trial: { port: async (request: AutomationStudioSubflowTrialRequest) => answered(request, await judge(request.proposal.subflows)) },
      accepted: (proposal) => accepted.push(proposal.revision),
      loop: {
        tools: [look], maxIterations: 8, maxToolCalls: 10,
        unusableDecisions: { maxConsecutive: 8, maxInARow: 8, stalled: () => new Error("stalled") },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", stateDigests: { before: PAGE, after: PAGE }, evidence: { ok: true, sites: 12 }, effectApplied: false, draft: { actionId: "demo.look", effect: "observe", proposes: false } }),
        decide
      }
    });

    // The refusal carries the mark the guard reads beside Core's feedback, as the inner controller wrote it.
    expect(entry(shown, "submit-drop")).toMatchObject({ ok: false, diagnostics: { code: AUTOMATION_STUDIO_CANDIDATE_KEPT_CONDITION_DROPPED_CODE, resend: "accepted_once" } });
    // The resend ran and was accepted as a new proposal; nothing refused it as a repeat.
    expect(entry(shown, "submit-again")).toMatchObject({ ok: true, revision: 3 });
    expect(accepted).toEqual([1, 3]);
    expect(JSON.stringify(shown)).not.toContain("llm_evidence_loop.repeat_refused");
  });
});
