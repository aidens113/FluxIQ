import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS, type AutomationStudioCandidateTrialVerdict, type AutomationStudioFlowCandidateSubmissionController, type AutomationStudioFlowCandidateTrialGate } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSubflowTrialKeptEveryRowRead, AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult, AutomationStudioSubflowTrialRowCheck } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioResultKeptCondition, AutomationStudioResultKeptConditionsCarrier } from "../../result-verification/standing-no/index.ts";
import { automationStudioLlmBuildPurseJudgeBackstopScope, automationStudioLlmBuildPurseScope, automationStudioLlmCurrentBuildPurse, type AutomationStudioLlmBuildPurse } from "../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { currentAutomationStudioActivityAgent, runWithAutomationStudioActivityAgent } from "../../activity/index.ts";
import { withAutomationStudioProjectAgent } from "../attribution/index.ts";
import type { AutomationStudioProjectStructurePlan } from "../contracts/index.ts";
import type { AutomationStudioProjectDispatchWholeTrial, AutomationStudioProjectDispatchWholeTrialAnswer } from "../dispatch/index.ts";
import type { AutomationStudioProjectSupervisorPorts } from "../supervisor/index.ts";
import { AutomationStudioProjectAssembledFrom } from "./assembled-from.ts";
import { automationStudioProjectSingleSubflowAssemble } from "./proposal-assembly.ts";
import { automationStudioProjectSingleSubflowPlan } from "./single-subflow-plan.ts";

// A single-subflow plan's one-brief path (t679; cost-gap design (5)). On a plan
// of one subflow the router runs, the assembled Flow is that subflow behind
// the arrival step, so a builder's subflow trial and the supervisor's whole
// trial ran the same thing, judged twice, with a reset brief between them. So
// the builder's `core.test_subflow` is the judged whole run itself:
//
// - the proposal under test is assembled with the code `project.assemble` uses
//   (`./assemble-latest.ts`, through `./proposal-assembly.ts`, which a
//   rebuild also calls) and submitted through the whole candidate's
//   controller, so the revision tested is the revision the supervisor
//   completes on;
// - that revision is tested with the supervisor's whole test
//   (`../supervisor/whole-trial.ts`, handed in as `test`), which records the
//   `candidate_trial` receipt, notes a failed whole test, keeps the build's
//   fallback and leaves the gate's standing verdict -- the creation rule's
//   evidence, unchanged;
// - under the supervisor's attribution, so the record names the judge the
//   supervisor's, as Core's own reset before an ending runs
//   (`../supervisor/supervisor-loop.ts`);
// - paid as a candidate builder's trials are (t685): under a scope of the
//   brief's allowance -- the purse the builder's gate asks the test under --
//   with the build's purse as the judge's backstop
//   (`llm/build-purse/judge-backstop.ts`). The judge draws on the allowance and
//   its top-ups first and on the build's judging reserve only when they cannot
//   pay, so a test is refused unaffordable only when neither can. t679 ran it
//   under the build's purse alone, where the open allowance's money is kept
//   from every other call: Lab run `run-mvblai1v-a31e7593` spent the reserve's
//   four judge calls on two tests and its third was refused with ~$0.23 of the
//   $0.25 unspent, most of it the brief's own. Asked outside an allowance
//   carved from the build's purse, the test runs under that purse as t679 did.
//   A scope, not a run, and what the allowance's refusal was before the test
//   is put back after it: a refused judge call fails as the trial reports it,
//   never as a thrown refusal the builder's gate would read as a failed port.
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
// **The conditions Core's record kept reach the builder's gate (t689).** The
// builder's gate remembers, from a scoped trial, the conditions Core's record
// of it showed keep out only rows the request does not ask for
// (`keptConditions`, `flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`),
// read off the record the trial's result carries beside its feedback
// (`standingNo`), and its controller refuses once a proposal that drops one.
// This path's answer was built from the whole test's evidence alone, which
// never carries that record (the whole gate keeps it from every model), so the
// builder's gate remembered nothing and a single-path build could drop a
// condition its own record had vindicated (A8 towels-like list build,
// `run-mvblov2i-abb7d82e`). The whole gate reads that record itself, against
// the composed Flow, and keeps what it found on the verdict it stands
// (`standing`); so the answer now carries those kept conditions, every time a
// test is judged, on the builder's numbering: each is named by the proposal of
// this subflow its whole revision was assembled from (`./assembled-from.ts`),
// this brief's where it made it. Conditions an earlier brief's judged run kept
// are inherited too (coordinator, t689): on this path a repair rebuilds the same
// subflow, and Core keeps a condition from any trial of it (t633, t644), so a
// repair is held to what the build brief before it was held to. A scoped
// brief's gate still keeps only its own trials' (`subflow-trial-gate.ts`). One
// shown by a whole revision no proposal of this subflow made is left out. A
// condition is matched by how it is
// written, which assembly copies unchanged, so the builder's proposal is held
// to exactly what the Flow was. The list is the whole gate's latest, conditions
// it took out again included, so the builder's gate replaces what it carried
// before with it. `standingNo` itself is not carried: the whole gate weighs a
// later no against it across every brief of the build, and weighed again by the
// builder's gate it would be counted twice.
//
// **And the reads Core flagged, with what the converse said (t692).** The whole
// test's feedback carries each read's `keptEveryRow`, Core's flag on a read that
// kept every item it saw after an act over a narrower read of the same list
// (`service/candidate-trial/reads.ts`), and a yes says whether its second judge
// call asked the converse question and agreed (`firstAskConfirmed`,
// `service/candidate-trial/feedback.ts`). The flagged reads ride beside the
// trial, Core-only, as the builder's gate reads them, and the trial's row check
// (`rowCheck`) beside it, which the whole test's port answers the gate's
// `checkRows` with (`./whole-test-port.ts`), so a flagged yes always has its check.
//
// **A test the build's working time cannot cover is not started (G2).** The
// supervisor's whole test refuses it `project.trial_out_of_time`
// (`../supervisor/whole-trial.ts`); the builder is told how much time is left,
// as that refusal said it, and to end its brief partial, since another test
// is refused the same way and its last finished test stands.
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
    + "An act the site offers no control to undo goes under cannotUndo when you test again, and the test then runs with it already done; name only an act you tried to undo and could not.",
  unaffordable: "Core did not start this test: neither this brief's money nor the money kept for judging the build's whole run can pay its two judge calls, so nothing ran and no judge was asked (refusal has the figures). "
    + "Testing again is refused the same way, so do not test again or change your subflow for it: end the brief partial and say so.",
  outOfTime: "Nothing ran and no judge was asked. Testing again is refused the same way, so do not test again or change your subflow for it: end the brief partial and say so. "
    + "The last finished test stands, and the person is told what it answered.",
  notRun: "Core did not run the whole Flow joined from this revision, for the reason under refusal. Change your subflow for what it names, submit it with core.submit_subflow, then test the new revision."
});

/** The whole gate's code for a trial the build's money cannot judge (`flow-bootstrap/candidate/trial-gate.ts`). */
const UNAFFORDABLE = "candidate.trial_unaffordable";
/** The supervisor's code for a test the build's working time left cannot cover (`../supervisor/whole-trial.ts`, G2). */
const OUT_OF_TIME = "project.trial_out_of_time";
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
    // The one single-subflow assembly, which a rebuild of a submitted script also calls (`./proposal-assembly.ts`).
    const assembled = await automationStudioProjectSingleSubflowAssemble({ structure, ports, controller, gate, kept: input.kept, scope, proposal });
    if (!assembled.ok) {
      if (assembled.kind === "assembly") return refused("project.assemble_refused", WORDS.assembleRefused, { issues: assembled.issues.map((issue) => ({ ...issue })) });
      return refused(assembled.code, assembled.code === UNCHANGED_AFTER_NO ? WORDS.judgedNo : WORDS.composedRefused, { refusal: assembled.feedback, issueCodes: assembled.issueCodes });
    }
    const { candidate } = assembled;
    const complete = { revision: candidate.revision, digest: candidate.digest };
    // The supervisor's judge, paid by the brief's allowance with the judging reserve as its backstop (header, t685).
    // The steps it runs are the builder's own test (its `test_subflow` asked for it): the chat puts them under the builder's heading,
    // never "Supervisor" (t774), while the step log and the purse keep the judge the supervisor's.
    const builder = currentAutomationStudioActivityAgent();
    const test = () => paidByBrief(ports.purse, () => input.test({ ...complete }, request.signal));
    const ran = await withAutomationStudioProjectAgent({ role: "supervisor" }, () => (builder ? runWithAutomationStudioActivityAgent(builder, test) : test()));
    return answerOf(request, ran, complete, keptOf(request, gate.standing(complete), AutomationStudioProjectAssembledFrom.of(controller)));
  };
}

/**
 * The conditions the whole gate kept as of the test of `complete` (header,
 * t689), on the builder's numbering: each named by the proposal of this
 * subflow its whole revision was assembled from -- this brief's where it made
 * it, an earlier brief's otherwise, which a repair inherits -- and one no
 * proposal of this subflow made left out. Undefined where the whole gate
 * stands no verdict for it.
 */
function keptOf(request: AutomationStudioSubflowTrialRequest, standing: ReturnType<AutomationStudioProjectSingleSubflowTrialInput["gate"]["standing"]>, made: AutomationStudioProjectAssembledFrom): AutomationStudioResultKeptCondition[] | undefined {
  if (!standing) return undefined;
  const { scope } = request;
  const carried = (standing as AutomationStudioResultKeptConditionsCarrier).keptConditions ?? [];
  return carried.flatMap((condition) => {
    const from = made.madeOf(condition.revision)?.filter((entry) => entry.subflowKey === scope.subflowKey) ?? [];
    const proposal = from.find((entry) => entry.briefId === scope.briefId) ?? from[0];
    return proposal ? [{ ...structuredClone(condition), revision: proposal.revision }] : [];
  });
}

/**
 * Runs `test` under the brief's allowance with `purse` as its judge's backstop,
 * when the test is asked under an allowance carved from `purse`; else under
 * `purse` itself, as t679 did (header). The allowance's refusal is put back as
 * it was before the test.
 */
async function paidByBrief<T>(purse: AutomationStudioLlmBuildPurse | undefined, test: () => Promise<T>): Promise<T> {
  const allowance = automationStudioLlmCurrentBuildPurse();
  if (!purse || !allowance || !carvedFrom(allowance, purse)) return await automationStudioLlmBuildPurseScope(purse, test);
  const was = allowance.refusal;
  try {
    return await automationStudioLlmBuildPurseJudgeBackstopScope(allowance, purse, test);
  } finally {
    allowance.refusal = was;
  }
}

/** Whether `allowance` was carved from `purse`, directly or through another allowance. */
function carvedFrom(allowance: AutomationStudioLlmBuildPurse, purse: AutomationStudioLlmBuildPurse): boolean {
  for (let above = allowance.parent; above; above = above.parent) {
    if (above === purse) return true;
  }
  return false;
}

/** The whole test's answer in the builder's terms (header): a trial of the proposal under test, or a refusal. */
function answerOf(request: AutomationStudioSubflowTrialRequest, ran: AutomationStudioLlmEvidenceToolExecutionResult, complete: { revision: number; digest: string }, kept: AutomationStudioResultKeptCondition[] | undefined): AutomationStudioProjectDispatchWholeTrialAnswer {
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
  const trial: AutomationStudioSubflowTrialResult & AutomationStudioResultKeptConditionsCarrier = {
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
  // The whole gate's kept conditions, every time, so the builder's gate replaces what it carried before (header, t689).
  if (kept) trial.keptConditions = kept;
  // The reads Core flagged and whether the converse confirmed the yes, beside the trial (header, t692).
  return { trial: withRowCheck(trial, evidence) };
}

/** A whole test's trial with the reads its feedback flagged beside it, and its row check (header, t692). */
function withRowCheck(trial: AutomationStudioSubflowTrialResult, evidence: JsonObject): AutomationStudioSubflowTrialResult {
  const feedback = isObject(evidence.feedback) ? evidence.feedback : {};
  const flagged = list(feedback.reads).flatMap((read): AutomationStudioSubflowTrialKeptEveryRowRead[] => {
    if (!isObject(read) || typeof read.nodeId !== "string" || typeof read.kept !== "number" || !isObject(read.keptEveryRow)) return [];
    return [{ nodeId: read.nodeId, kept: read.kept, keptEveryRow: structuredClone(read.keptEveryRow) as unknown as AutomationStudioSubflowTrialKeptEveryRowRead["keptEveryRow"] }];
  });
  const rowCheck: AutomationStudioSubflowTrialRowCheck = { converse: trial.verdict === "yes" && feedback.firstAskConfirmed === true ? "confirmed" : "unconfirmed" };
  return Object.assign(trial, { ...(flagged.length ? { keptEveryRow: flagged } : {}), rowCheck });
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
  // The time left, as the supervisor's refusal said it, then the builder's way on (header, G2).
  if (code === OUT_OF_TIME) return refused(code, `${typeof said.said === "string" ? `${said.said} ` : ""}${WORDS.outOfTime}`, { refusal: structuredClone(said) });
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
