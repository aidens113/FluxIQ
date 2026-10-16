import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS, type AutomationStudioCandidateTrialVerdict, type AutomationStudioFlowCandidateSubmissionController, type AutomationStudioFlowCandidateTrialGate } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioLlmBuildPurseScope } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { withAutomationStudioProjectAgent } from "../attribution/index.ts";
import type { AutomationStudioProjectStructurePlan } from "../contracts/index.ts";
import type { AutomationStudioProjectDispatchWholeTrial, AutomationStudioProjectDispatchWholeTrialAnswer } from "../dispatch/index.ts";
import type { AutomationStudioProjectSupervisorPorts } from "../supervisor/index.ts";
import { automationStudioProjectAssembleLatest } from "./assemble-latest.ts";
import { AutomationStudioProjectAssembledFrom } from "./assembled-from.ts";
import { automationStudioProjectSingleSubflowPlan } from "./single-subflow-plan.ts";

// A single-subflow plan's one-brief path (t679; cost-gap design (5)). On a plan
// of one subflow the router runs, the assembled Flow is that subflow behind
// the arrival step, so a builder's subflow trial and the supervisor's whole
// trial ran the same thing, judged twice, with a reset brief between them. So
// the builder's `core.test_subflow` is the judged whole run itself:
//
// - the proposal under test is assembled with the code `project.assemble` uses
//   (`./assemble-latest.ts`) and submitted through the whole candidate's
//   controller, so the revision tested is the revision the supervisor
//   completes on;
// - that revision is tested with the supervisor's whole test
//   (`../supervisor/whole-trial.ts`, handed in as `test`), which records the
//   `candidate_trial` receipt, notes a failed whole test, keeps the build's
//   fallback and leaves the gate's standing verdict -- the creation rule's
//   evidence, unchanged;
// - under the supervisor's purse frame and attribution, as Core's own reset
//   before an ending runs (`../supervisor/supervisor-loop.ts`), so its judge
//   draws on the build's judging reserve and not on the builder's allowance.
//   A scope frame, not a run frame: a refused judge call fails as the trial
//   reports it, never as a thrown refusal the builder's gate would read as a
//   failed port.
//
// The builder's gate has put the site back first (its project reset, and the
// start hook ahead of it); the whole gate then checks every ledger again
// before it runs, as it always does. Its answer comes back to the builder as a
// subflow trial of the proposal under test: its verdict, its run id, its
// feedback with the whole test's revision, digest and the `complete` object
// beside it. Its acts are not carried: the whole trial port records them
// under the supervisor (`service/project-build/whole-trials.ts`), and carried
// here they would be recorded again in the brief's own ledger. A refusal --
// the Flow could not be assembled, its composed submission was refused, the
// whole gate would not run it -- is no verdict: it comes back as `refused`, in
// the builder's terms (`../dispatch/port.ts`).
//
// Every other plan gets no such test: `undefined`.

/** What the single-subflow test works with: the supervisor's plan, ports, controller and gate, and its whole test. */
export type AutomationStudioProjectSingleSubflowTrialInput = {
  structure: AutomationStudioProjectStructurePlan | undefined;
  ports: Pick<AutomationStudioProjectSupervisorPorts, "proposals" | "submission" | "purse">;
  controller: AutomationStudioFlowCandidateSubmissionController;
  gate: Pick<AutomationStudioFlowCandidateTrialGate, "available" | "standing" | "refuted">;
  /** The plan digest each proposal the plan in force kept from an earlier plan was made under. */
  kept: ReadonlyMap<string, string>;
  /** The supervisor's whole test of `{revision, digest}` (`../supervisor/whole-trial.ts`): `core.test_candidate` as the supervisor runs it. */
  test(value: JsonObject, signal: AbortSignal): Promise<AutomationStudioLlmEvidenceToolExecutionResult>;
};

/** What a builder is told, in its own terms, beside a whole test or for one that did not run. Generic words. */
const WORDS = Object.freeze({
  wholeTest: "This test ran the whole Flow from its start, as the build's judged run: the plan is your one subflow, behind the step that opens the build's start page. "
    + "Its verdict is the judged whole run's, so a yes completes this brief; the supervisor completes the Flow on it (complete).",
  notThisPlan: "This test runs the whole Flow only for the one subflow of the plan in force, and this brief is not of it, so nothing ran. End the brief blocked and say so.",
  assembleRefused: "Core could not join your subflow into the whole Flow, as listed under issues, so nothing ran. Change your subflow for what they name, submit it with core.submit_subflow, then test the new revision.",
  composedRefused: "Core joined your subflow into the whole Flow, and that Flow was refused, as listed under refusal, so nothing ran. Change your subflow for what it names, submit it with core.submit_subflow, then test the new revision.",
  judgedNo: "Your subflow joins into a whole Flow that was already tried and judged no (refusal has what the judge said), so it was not tried again. Change your subflow to answer that, submit it with core.submit_subflow, then test the new revision.",
  resetRequired: "Before the whole Flow could run, lasting acts this build made were still on the site, as listed under actsToUndo, so nothing ran. Undo each with the site's own controls, then test the same revision and digest again. "
    + "If the site offers no control that undoes one, end the brief partial and name that act, so the supervisor can have it put back.",
  unaffordable: "Core did not start this test: the money kept for judging the build's whole run cannot pay its two judge calls, so nothing ran and no judge was asked (refusal has the figures). "
    + "Testing again is refused the same way, so do not test again or change your subflow for it: end the brief partial and say so.",
  notRun: "Core did not run the whole Flow joined from this revision, for the reason under refusal. Change your subflow for what it names, submit it with core.submit_subflow, then test the new revision."
});

/** The whole gate's code for a trial the build's money cannot judge (`flow-bootstrap/candidate/trial-gate.ts`). */
const UNAFFORDABLE = "candidate.trial_unaffordable";
/** The supervisor's code for acts still on the site before a whole test (`../supervisor/whole-trial.ts`). */
const RESET_REQUIRED = "project.trial_reset_required";
/** The controller's code for a composed Flow the judge already refuted (`flow-bootstrap/candidate/unchanged-submission.ts`). */
const UNCHANGED_AFTER_NO = "candidate.unchanged_after_no";

export function automationStudioProjectSingleSubflowTrial(input: AutomationStudioProjectSingleSubflowTrialInput): AutomationStudioProjectDispatchWholeTrial | undefined {
  const { structure, ports, controller, gate } = input;
  const subflowKey = automationStudioProjectSingleSubflowPlan(structure);
  if (!structure || subflowKey === undefined || !gate.available) return undefined;
  return async (request) => {
    const { scope, proposal } = request;
    if (scope.subflowKey !== subflowKey || scope.planDigest !== structure.digest || proposal.scope.briefId !== scope.briefId || proposal.scope.subflowKey !== subflowKey) return refused("project.whole_trial_not_this_plan", WORDS.notThisPlan);
    // Kept for the supervisor to read back by the name a done return gives it (`./assembled-from.ts`).
    AutomationStudioProjectAssembledFrom.of(controller).keep(proposal);
    const assembled = await automationStudioProjectAssembleLatest({
      structure, ports, controller, gate, kept: input.kept, inHand: proposal,
      from: [{ subflowKey, briefId: scope.briefId, revision: proposal.revision, digest: proposal.digest, predecessors: scope.predecessors }],
      summary: `A Flow of one subflow, ${subflowKey}, assembled from its builder's proposal under test.`
    });
    if (!assembled.ok) {
      if (assembled.kind === "assembly") return refused("project.assemble_refused", WORDS.assembleRefused, { issues: assembled.issues.map((issue) => ({ ...issue })) });
      return refused(assembled.code, assembled.code === UNCHANGED_AFTER_NO ? WORDS.judgedNo : WORDS.composedRefused, { refusal: assembled.feedback, issueCodes: assembled.issueCodes });
    }
    const { candidate } = assembled;
    const complete = { revision: candidate.revision, digest: candidate.digest };
    // The supervisor's judge, on the judging reserve (header).
    const ran = await withAutomationStudioProjectAgent({ role: "supervisor" }, () => automationStudioLlmBuildPurseScope(ports.purse, () => input.test({ ...complete }, request.signal)));
    return answerOf(request, ran, complete);
  };
}

/** The whole test's answer in the builder's terms (header): a trial of the proposal under test, or a refusal. */
function answerOf(request: AutomationStudioSubflowTrialRequest, ran: AutomationStudioLlmEvidenceToolExecutionResult, complete: { revision: number; digest: string }): AutomationStudioProjectDispatchWholeTrialAnswer {
  const evidence = isObject(ran.evidence) ? ran.evidence : {};
  const verdict = verdictOf(evidence.verdict);
  if (verdict === undefined || evidence.revision !== complete.revision || evidence.digest !== complete.digest) return refusalOf(evidence);
  const { scope, proposal } = request;
  const trialRunId = typeof evidence.trialRunId === "string" && evidence.trialRunId ? evidence.trialRunId : undefined;
  const feedback: JsonObject = {
    ...(isObject(evidence.feedback) ? structuredClone(evidence.feedback) : {}),
    wholeTest: { revision: complete.revision, digest: complete.digest, verdict, ...(trialRunId ? { trialRunId } : {}), said: WORDS.wholeTest },
    complete: { ...complete },
    // A pass the run rescued says so to the builder too; the supervisor answers it with a repair (`../supervisor/completion.ts`).
    ...(Array.isArray(evidence.slowDown) ? { slowDown: structuredClone(evidence.slowDown) } : {})
  };
  const trial: AutomationStudioSubflowTrialResult = {
    partial: true,
    scope: "subflow",
    identity: { buildId: scope.buildId, briefId: scope.briefId, planDigest: scope.planDigest, subflowKey: scope.subflowKey },
    revision: proposal.revision,
    digest: proposal.digest,
    verdict,
    feedback,
    entryPrepared: true
  };
  if (trialRunId) trial.trialRunId = trialRunId;
  return { trial };
}

/** A whole test that did not run, in the builder's terms (header): never a verdict. */
function refusalOf(evidence: JsonObject): AutomationStudioProjectDispatchWholeTrialAnswer {
  const code = typeof evidence.code === "string" ? evidence.code : "project.whole_trial_not_run";
  if (code === RESET_REQUIRED) {
    const acts = list(evidence.actsInPlace).flatMap((entry) => (isObject(entry) && typeof entry.act === "string" ? [{ act: entry.act, did: typeof entry.did === "string" ? entry.did : "an act" }] : []));
    const cannotUndo = list(evidence.cannotUndo);
    return refused("candidate.trial_reset_required", WORDS.resetRequired, { actsToUndo: acts, ...(cannotUndo.length ? { cannotUndo: structuredClone(cannotUndo) } : {}) }, true);
  }
  const { instruction: _instruction, ok: _ok, ...said } = evidence;
  return refused(code, code === UNAFFORDABLE ? WORDS.unaffordable : WORDS.notRun, { refusal: structuredClone(said) });
}

function refused(code: string, instruction: string, detail: JsonObject = {}, retry = false): AutomationStudioProjectDispatchWholeTrialAnswer {
  return { refused: { code, instruction, detail, retry } };
}

function verdictOf(value: JsonValue | undefined): AutomationStudioCandidateTrialVerdict | undefined {
  return (AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS as readonly unknown[]).includes(value) ? value as AutomationStudioCandidateTrialVerdict : undefined;
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
