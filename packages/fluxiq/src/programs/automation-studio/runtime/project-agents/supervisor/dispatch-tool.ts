import type { JsonObject } from "../../../../../core/index.ts";
import { emitAutomationStudioProjectBriefCard, emitAutomationStudioProjectReturnCard } from "../../activity/project/index.ts";
import { automationStudioCandidateSameBehaviour } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioFlowBuildPlan } from "../../flow-bootstrap/plan/index.ts";
import type { AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioProjectBuilderReturn, automationStudioProjectBuilderReturn as RETURN, automationStudioProjectSubflowBrief, type AutomationStudioProjectBuilderReturn, type AutomationStudioProjectSubflowBrief, type AutomationStudioProjectTrialRef } from "../contracts/index.ts";
import { AutomationStudioProjectRecordRefusal } from "../record/index.ts";
import { automationStudioProjectSupervisorBriefInput } from "./brief-input.ts";
import { automationStudioProjectSupervisorBriefSizing } from "./brief-sizing.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { automationStudioProjectSupervisorDispatchOrder } from "./dispatch-order.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
import { automationStudioProjectSupervisorLeftOnTarget, type AutomationStudioProjectSupervisorLeftOnTarget } from "./left-on-target.ts";
import type { AutomationStudioProjectSupervisorRescuedTest } from "./state.ts";
import { automationStudioProjectSupervisorToolAnswer as answer } from "./tool-answer.ts";

/** Floating-point slack, as the purse keeps it. */
const EPSILON_USD = 1e-9;

/**
 * `project.dispatch`: the briefs are sized by Core from what the purse can
 * still give (`./brief-sizing.ts`, t570), read and checked whole (`./brief-input.ts`),
 * put in the order their entries need (`./dispatch-order.ts`), held to the money
 * the purse can still give (its judging reserve never among it), recorded in
 * the build record with the decision and its reason, shown in the chat, and
 * handed to the dispatcher (`../dispatch/port.ts`), which runs each to its
 * return. Nothing is recorded or sent unless every brief passes.
 *
 * A return that does not answer its brief -- another brief's id, a proposal
 * for another subflow -- is read as blocked, with the code that says why: the
 * supervisor never assembles what a brief did not ask for. A reset brief that
 * came back done -- with no proposal, as a reset has none -- clears what the
 * last whole trial left (`./whole-trial.ts`).
 *
 * **No second reset with nothing changed (social debug fix 5, t590).** Social
 * `run-mv85xmgq-8a6a6f43` sent a reset brief right after one that came back
 * blocked, with the same acts on the target; it could only do the same, and on
 * the way it pressed a control the task said to leave. So a call of reset
 * briefs only, sent while the build's latest brief is a reset that came back
 * not done and what is left on the target (`./left-on-target.ts`) is what it
 * left, is answered `project.reset_repeated` without running: what the first
 * left, its reason, and what to do now -- test, since an act a reset tried and
 * could not undo is kept and no longer holds the test back, or end honestly.
 * Anything else sent first, a whole test above all, lets a reset run again.
 *
 * **No brief that can only spend on nothing (bigbox and crossborder debug,
 * t595).** Bigbox `run-mv8c7unr-42a8456d` sent eight repairs after one whole
 * test failed: each builder wrote the same steps again, each came back done,
 * and nothing told the supervisor the build had not moved. Crossborder
 * `run-mv8c76i3-61b9ca89` sent a brief again, unchanged, after it came back
 * blocked. Three checks now stand in front of the dispatcher:
 *
 * - A repair's `failingReceipt` must name a trial that did not pass: the
 *   latest whole test, whose verdict and what it said Core puts on the brief
 *   (`failingTrial`, `contracts/subflow-brief.ts`), or a trial a return of
 *   that subflow listed, other than the yes a done return ended on. Anything
 *   else is refused by its path, with the whole test's own reference to copy
 *   when one stands that did not pass.
 * - A brief for a subflow whose latest brief came back blocked after its
 *   builder ran, sent with everything it starts from as it stood when that
 *   return came back -- its kind, parts, entry and its predecessors'
 *   proposals, excerpt, receipt, and what this build has left on the target
 *   (`sentKey`) -- is answered
 *   `project.brief_repeated`: what came back, and to change the brief, amend
 *   the plan or end honestly.
 * - A build or repair brief that comes back done with a proposal doing
 *   exactly what the one it replaces did (`automationStudioCandidateSameBehaviour`,
 *   names set aside) is said to have changed nothing (`changedNothing`), and a
 *   further brief of that subflow while the plan and the latest whole test
 *   stand as they were is answered `project.repair_unchanged`: test the
 *   latest assembled Flow again where it may be retested, assemble and test
 *   where nothing is assembled, or else amend the plan or end honestly.
 *
 * **A whole test the run rescued may be repaired (social debug, t603).**
 * Social `run-mv8mebid-84ada5bd` passed its whole test only because the run
 * recovered by itself when the site asked it to slow down; the trial gate held
 * that yes back from completion, and the repair the supervisor rightly sent
 * was refused four times as naming a trial that passed. A repair's
 * `failingReceipt` may now name the latest whole test when it passed and the
 * gate holds it back for what the run recovered from and the Flow does not
 * answer (`rescuedTest`, `./state.ts`): its brief carries that trial with each
 * such step from its step record (`interruptions`, `contracts/subflow-brief.ts`),
 * which its builder is shown (`../dispatch/run-brief.ts`). A passing trial with
 * nothing of the kind is still refused. When that repair cannot be made -- it
 * comes back not done or changed nothing, or the purse cannot give a call of
 * only such repairs its allowance -- the state says so, and the answer names
 * the test that still stands (`wholeTestStands`), which the supervisor may
 * then complete on (`./completion.ts`).
 */
export async function automationStudioProjectSupervisorDispatchTool(context: AutomationStudioProjectSupervisorContext, value: JsonObject): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports, state } = context;
  const structure = state.structure;
  const taskSpec = state.taskSpec;
  if (!structure || !taskSpec) return answer.refused("project.plan_missing", GUIDANCE.refusals.noPlan);
  const sent = Array.isArray(value.briefs) ? value.briefs.filter((brief): brief is JsonObject => Boolean(brief) && typeof brief === "object" && !Array.isArray(brief)) : [];
  const repeated = Array.isArray(value.briefs) && sent.length === value.briefs.length && sent.length && sent.every((brief) => brief.kind === "reset") ? repeatedReset(context) : undefined;
  if (repeated) return repeated;
  // The latest whole test, when it passed only on the run's own recovery (header), and whether this call only repairs it.
  const rescued = state.rescuedTest(context.controller, context.gate);
  const onlyRescue = rescued !== undefined && sent.length > 0 && sent.length === (Array.isArray(value.briefs) ? value.briefs.length : -1) && sent.every((brief) => repairsRescued(brief, rescued));
  // Only a list of objects is sized; anything else is refused by the reading below, by its place.
  const sizing = ports.purse && Array.isArray(value.briefs) && sent.length === value.briefs.length && sent.length
    ? automationStudioProjectSupervisorBriefSizing({ sent, purse: ports.purse, structure, done: new Set(state.latestDone().keys()), supervisorCalls: ports.finishing?.supervisorCalls ?? 0 })
    : undefined;
  if (sizing && !sizing.ok) {
    const { ok: _ok, ...figures } = sizing;
    return answer.refused("project.allowance_unavailable", GUIDANCE.refusals.allowanceUnavailable, { ...figures, canGiveUsd: usd(figures.canGiveUsd), ...unaffordable(context, onlyRescue ? rescued : undefined) });
  }
  const read = automationStudioProjectSupervisorBriefInput({ value, structure, taskSpec, after: state.after, ...(sizing ? { sizes: sizing.sizes } : {}), nextId: state.briefIds() });
  if (!read.ok) {
    const survey = read.issues.some((issue) => issue.code === "project.brief_survey_unavailable");
    return answer.refused(survey ? "project.brief_survey_unavailable" : "project.brief_refused", survey ? GUIDANCE.refusals.surveyUnavailable : GUIDANCE.refusals.briefRefused, { issues: read.issues });
  }
  const failing = failingTrials(context, read.briefs, rescued);
  if (failing.issues.length) return answer.refused("project.brief_refused", GUIDANCE.refusals.briefRefused, { issues: failing.issues });
  const spent = repeatedBrief(context, failing.briefs) ?? unchangedAgain(context, failing.briefs);
  if (spent) return spent;
  const order = automationStudioProjectSupervisorDispatchOrder(failing.briefs, new Set(state.latestDone().keys()), state.droppedByEarlierPlans());
  if (!order.ok) return answer.refused(order.code === "cycle" ? "project.dispatch_cycle" : "project.predecessor_not_done", order.code === "cycle" ? GUIDANCE.refusals.dispatchCycle : GUIDANCE.refusals.predecessorNotDone, { issues: order.issues });
  const requestedUsd = order.ordered.reduce((sum, brief) => sum + brief.allowanceUsd, 0);
  const canGiveUsd = ports.purse?.allocatableUsd();
  if (canGiveUsd !== undefined && requestedUsd > canGiveUsd + EPSILON_USD) return answer.refused("project.allowance_unavailable", GUIDANCE.refusals.allowanceUnavailable, { requestedUsd, canGiveUsd, ...unaffordable(context, onlyRescue ? rescued : undefined) });
  const earlier = state.answeredUnderPlan();
  // Each subflow's proposal a brief may replace, before any of them runs (header).
  const before = state.latestDone();
  try {
    for (const brief of order.ordered) {
      await ports.record.recordBrief(ports.build, brief);
      state.briefs.push(brief);
    }
  } catch (error) {
    if (!(error instanceof AutomationStudioProjectRecordRefusal)) throw error;
    return answer.refused("project.brief_refused", GUIDANCE.refusals.briefRefused, { issues: [{ code: error.code, path: error.path }] });
  }
  // A brief for a subflow that already came back short is a triage of that return.
  const triage = order.ordered.some((brief) => earlier.some((answered) => answered.brief.subflowKey === brief.subflowKey && answered.returned.outcome !== "done"));
  await ports.record.recordDecision(ports.build, { kind: triage ? "triage" : "dispatch", reason: read.reason, briefIds: order.ordered.map((brief) => brief.briefId), planDigest: structure.digest });
  for (const brief of order.ordered) emitAutomationStudioProjectBriefCard({ brief, structurePlan: structure, taskSpec, ...(state.purposes[brief.subflowKey] ? { purpose: state.purposes[brief.subflowKey]! } : {}) });
  const signal = context.signal ?? new AbortController().signal;
  let given: readonly AutomationStudioProjectBuilderReturn[];
  try {
    given = (await ports.dispatch({ briefs: order.ordered, signal })).returns;
  } catch (error) {
    if (signal.aborted) throw error;
    return answer.refused("project.dispatch_failed", GUIDANCE.refusals.dispatchFailed, { briefIds: order.ordered.map((brief) => brief.briefId) }, { retry: true });
  }
  const returns = order.ordered.map((brief, index) => answering(brief, given[index]));
  for (const [index, brief] of order.ordered.entries()) {
    const returned = returns[index]!;
    state.answer(brief.briefId, returned);
    if (brief.kind === "reset" && returned.outcome === "done") state.wholeTrialLeftActs = false;
    emitAutomationStudioProjectReturnCard({ returned, brief, structurePlan: structure });
  }
  // What the call's last reset left, when it came back not done, for a second reset sent with nothing changed (header).
  const lastReset = [...order.ordered.entries()].reverse().find(([, brief]) => brief.kind === "reset");
  if (lastReset) {
    const [index, brief] = lastReset;
    const returned = returns[index]!;
    state.resetLeft = returned.outcome === "done" ? undefined : { briefId: brief.briefId, outcome: returned.outcome, reason: returned.reason, left: leftKey(automationStudioProjectSupervisorLeftOnTarget(ports, state)) };
  }
  // What each brief was sent with, and what stood once every return came back: the same brief sent again with nothing changed since matches it (header).
  for (const brief of order.ordered) state.sentAs.set(brief.briefId, sentKey(context, brief));
  const unchanged = await changedNothing(context, order.ordered, returns, before);
  const allDone = returns.every((returned) => returned.outcome === "done");
  const reset = order.ordered.every((brief) => brief.kind === "reset");
  // A repair of the rescued whole test that came back not done or changed nothing: that test still stands (header).
  const short = rescued && order.ordered.some((brief, index) => brief.failingTrial?.verdict === "yes" && (returns[index]!.outcome !== "done" || unchanged.has(brief.briefId))) ? rescued : undefined;
  if (short) state.recoveryRepairsShort.set(short.key, "short");
  return answer.answered({
    ok: true,
    returns: order.ordered.map((brief, index) => compact(brief, returns[index]!, unchanged.get(brief.briefId), RETURN.closestTrial(state.answeredFor(brief.subflowKey).map(({ returned }) => returned)))),
    lastingActsInPlace: ports.projectLedger.snapshot().acts.filter((act) => act.inPlace).length,
    ...(short ? { wholeTestStands: { complete: { revision: short.revision, digest: short.digest } } } : {}),
    next: short ? GUIDANCE.next.afterRecoveryRepairShort : unchanged.size ? GUIDANCE.next.afterRepairUnchanged : !allDone ? GUIDANCE.next.afterReturnsNotDone : reset ? GUIDANCE.next.afterReset : GUIDANCE.next.afterReturnsDone
  }, { acted: true });
}

/** Whether a brief as sent repairs the rescued whole test, naming it by its receipt (header). */
function repairsRescued(brief: JsonObject, rescued: AutomationStudioProjectSupervisorRescuedTest): boolean {
  const receipt = brief.failingReceipt;
  if (brief.kind !== "repair" || !receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  return receipt.kind === rescued.receipt.kind && receipt.receiptId === rescued.receipt.receiptId && receipt.digest === rescued.receipt.digest;
}

/** Beside a refused allowance for a call of only repairs of the rescued whole test: the test that still stands, now marked as one its repair could not be paid for (header). */
function unaffordable(context: AutomationStudioProjectSupervisorContext, rescued: AutomationStudioProjectSupervisorRescuedTest | undefined): JsonObject {
  if (!rescued) return {};
  context.state.recoveryRepairsShort.set(rescued.key, "money");
  return { wholeTestStands: { complete: { revision: rescued.revision, digest: rescued.digest }, instruction: GUIDANCE.issues.recoveryRepairUnaffordable } };
}

type Issue = { code: string; path: string; why: string } & JsonObject;

/**
 * Each repair's failing receipt checked, and the latest whole test's read onto
 * the brief that names it (header): one that did not pass, or one that passed
 * only on the run's own recovery (`rescued`), with each step it recovered at;
 * every issue by its path.
 */
function failingTrials(context: AutomationStudioProjectSupervisorContext, briefs: readonly AutomationStudioProjectSubflowBrief[], rescued: AutomationStudioProjectSupervisorRescuedTest | undefined): { briefs: AutomationStudioProjectSubflowBrief[]; issues: Issue[] } {
  const { state, controller, gate } = context;
  const latest = controller.latest();
  const standing = latest ? gate.standing(latest) : undefined;
  // The whole test to name instead, when one stands that did not pass or passed only on the run's own recovery.
  const wholeTest: JsonObject | undefined = latest && standing && (standing.verdict !== "yes" || rescued) ? { kind: "candidate_trial", receiptId: standing.trialRunId ?? `whole-test-${latest.revision}`, digest: latest.digest } : undefined;
  const issues: Issue[] = [];
  const refuse = (code: string, path: string, why: string, closest?: JsonObject) => {
    issues.push({ code, path, why, ...(wholeTest ? { wholeTest } : {}), ...(closest ? { closestTrial: closest } : {}) });
  };
  const read = briefs.map((brief, index) => {
    const receipt = brief.failingReceipt;
    const path = `briefs.${index}.failingReceipt`;
    if (brief.kind !== "repair" || !receipt) return brief;
    if (receipt.kind === "candidate_trial") {
      const names = latest && standing && latest.digest === receipt.digest && (standing.trialRunId === undefined || standing.trialRunId === receipt.receiptId);
      const trial = names ? automationStudioProjectSubflowBrief.failingTrial(standing, rescued?.unanswered) : undefined;
      if (!names) refuse("project.failing_receipt_not_latest_test", path, GUIDANCE.issues.failingNotLatestTest);
      else if (!trial) refuse("project.failing_receipt_passed", path, GUIDANCE.issues.failingPassed);
      return trial ? { ...brief, failingTrial: trial } : brief;
    }
    const returns = state.answeredFor(brief.subflowKey).map(({ returned }) => returned);
    const listed = returns.flatMap((returned) => returned.trials.flatMap((trial, at) => (trial.receiptId === receipt.receiptId && trial.digest === receipt.digest ? [{ returned, trial, last: at === returned.trials.length - 1 }] : [])));
    // The subflow's trial closest to passing (`../contracts/builder-return.ts`, t606): offered beside a refusal, and started from instead of a worse one.
    const closest = RETURN.closestTrial(returns);
    const offered = closest ? { ...RETURN.trialRef(closest) } : undefined;
    if (!listed.length) refuse("project.failing_receipt_unknown", path, GUIDANCE.issues.failingUnknown, offered);
    // The trial a done return ended on is the yes it was done on.
    else if (listed.every((entry) => entry.last && entry.returned.outcome === "done")) refuse("project.failing_receipt_passed", path, GUIDANCE.issues.failingPassed, offered);
    else if (closest && RETURN.trialAbove(closest, listed.at(-1)!.trial)) return { ...brief, failingReceipt: RETURN.trialRef(closest) };
    return brief;
  });
  return { briefs: read, issues };
}

/** What a brief is sent with and into, as one comparable key (header). */
function sentKey(context: AutomationStudioProjectSupervisorContext, brief: AutomationStudioProjectSubflowBrief): string {
  const done = context.state.latestDone();
  return JSON.stringify({
    plan: brief.planDigest, kind: brief.kind, subflowKey: brief.subflowKey, parts: [...brief.parts].sort(), caseId: brief.entry.caseId,
    predecessors: [...brief.entry.predecessors].sort().map((key) => [key, done.get(key)?.brief.briefId ?? null, done.get(key)?.returned.proposal?.revision ?? null]),
    excerpt: brief.recordingExcerpt ?? null,
    receipt: brief.failingReceipt ? [brief.failingReceipt.kind, brief.failingReceipt.receiptId, brief.failingReceipt.digest] : null,
    left: leftKey(automationStudioProjectSupervisorLeftOnTarget(context.ports, context.state))
  });
}

/** The refusal of a brief sent again unchanged after its subflow's latest brief came back blocked once its builder ran (header); undefined when none is. */
function repeatedBrief(context: AutomationStudioProjectSupervisorContext, briefs: readonly AutomationStudioProjectSubflowBrief[]): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
  const repeated = briefs.flatMap((brief, index) => {
    const last = brief.kind === "reset" ? undefined : context.state.latestFor(brief.subflowKey);
    if (!last || last.returned.outcome !== "blocked" || last.returned.calls === 0) return [];
    const was = context.state.sentAs.get(last.brief.briefId);
    return was !== undefined && was === sentKey(context, brief) ? [{ path: `briefs.${index}`, subflowKey: brief.subflowKey, lastBrief: { briefId: last.brief.briefId, outcome: last.returned.outcome, reason: last.returned.reason } }] : [];
  });
  return repeated.length ? answer.refused("project.brief_repeated", GUIDANCE.refusals.briefRepeated, { repeated }, { retry: true }) : undefined;
}

/** The refusal of a further brief of a subflow whose latest repair changed nothing, while what stood then stands (header); undefined when none is. */
function unchangedAgain(context: AutomationStudioProjectSupervisorContext, briefs: readonly AutomationStudioProjectSubflowBrief[]): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
  const { state, controller, gate } = context;
  const standing = standingKey(context);
  const unchanged = briefs.flatMap((brief, index) => {
    const repair = brief.kind === "reset" ? undefined : state.unchangedRepairs.get(brief.subflowKey);
    return repair && repair.planDigest === brief.planDigest && repair.standing === standing ? [{ path: `briefs.${index}`, subflowKey: brief.subflowKey, repair: repair.briefId, sameAs: repair.sameAs }] : [];
  });
  if (!unchanged.length) return undefined;
  const latest = controller.latest();
  const retest = gate.retestable();
  const instruction = !latest ? GUIDANCE.refusals.repairUnchangedAssemble : "revision" in retest ? GUIDANCE.refusals.repairUnchangedTest : GUIDANCE.refusals.repairUnchangedEnd;
  const test = latest ? gate.standing(latest) : undefined;
  return answer.refused("project.repair_unchanged", instruction, { unchanged, ...(latest ? { latestTest: { revision: latest.revision, verdict: test?.verdict ?? "not_tested", ...("revision" in retest ? { trialsSoFar: retest.trials } : {}) } } : {}) }, { retry: true });
}

/** The latest assembled Flow, its latest whole test and whether it may be tested again, as one comparable key (header). */
function standingKey(context: AutomationStudioProjectSupervisorContext): string {
  const latest = context.controller.latest();
  const standing = latest ? context.gate.standing(latest) : undefined;
  return JSON.stringify([latest?.revision ?? null, latest?.digest ?? null, standing?.trialRunId ?? null, standing?.verdict ?? null, context.gate.retestable()]);
}

/**
 * Each build or repair brief that came back done with a proposal doing exactly
 * what the one it replaces did, by brief id, with the brief it matches; kept in
 * the state for the next dispatch's check (header). A done return that changed
 * something clears its subflow's mark.
 */
async function changedNothing(context: AutomationStudioProjectSupervisorContext, briefs: readonly AutomationStudioProjectSubflowBrief[], returns: readonly AutomationStudioProjectBuilderReturn[], before: ReturnType<AutomationStudioProjectSupervisorContext["state"]["latestDone"]>): Promise<Map<string, { briefId: string; revision: number }>> {
  const { ports, state } = context;
  const unchanged = new Map<string, { briefId: string; revision: number }>();
  for (const [index, brief] of briefs.entries()) {
    const returned = returns[index]!;
    const prior = before.get(brief.subflowKey);
    if (brief.kind === "reset" || returned.outcome !== "done" || !returned.proposal) continue;
    const [now, then] = prior?.returned.proposal ? await Promise.all([proposalOf(ports, brief.briefId, returned), proposalOf(ports, prior.brief.briefId, prior.returned)]) : [undefined, undefined];
    if (!prior || !now || !then || !automationStudioCandidateSameBehaviour(asPlan(now), asPlan(then))) {
      state.unchangedRepairs.delete(brief.subflowKey);
      continue;
    }
    const sameAs = { briefId: prior.brief.briefId, revision: prior.returned.proposal!.revision };
    state.unchangedRepairs.set(brief.subflowKey, { briefId: brief.briefId, sameAs, planDigest: brief.planDigest, standing: standingKey(context) });
    unchanged.set(brief.briefId, sameAs);
  }
  return unchanged;
}

/** The proposal a done return names, read through the proposals port; undefined when it holds none by that name. */
async function proposalOf(ports: AutomationStudioProjectSupervisorContext["ports"], briefId: string, returned: AutomationStudioProjectBuilderReturn): Promise<AutomationStudioSubflowProposal | undefined> {
  const named = returned.proposal!;
  const proposal = await ports.proposals({ briefId, subflowKey: named.subflowKey, revision: named.revision, digest: named.digest });
  return proposal && proposal.revision === named.revision && proposal.digest === named.digest ? proposal : undefined;
}

/** A proposal's subflows as a plan of their own, for the comparison a whole candidate's resubmission is held to (header). */
function asPlan(proposal: AutomationStudioSubflowProposal): AutomationStudioFlowBuildPlan {
  return { plan: { schemaVersion: "0.1", router: { name: "", rules: [], fallback: { kind: "subflow", targetSubflowKey: proposal.scope.subflowKey } }, subflows: proposal.subflows.map((subflow) => structuredClone(subflow)) }, risk: "low", subflows: [] };
}

/** The refusal of a reset sent right after one that came back not done, with what is left unchanged (header); undefined when a reset may run. */
function repeatedReset(context: AutomationStudioProjectSupervisorContext): AutomationStudioLlmEvidenceToolExecutionResult | undefined {
  const { ports, state, controller } = context;
  const latest = state.briefs.at(-1);
  const before = state.resetLeft;
  if (!latest || !before || before.briefId !== latest.briefId || !state.resetCameBackLast()) return undefined;
  const left = automationStudioProjectSupervisorLeftOnTarget(ports, state);
  if (leftKey(left) !== before.left) return undefined;
  return answer.refused("project.reset_repeated", controller.latest() ? GUIDANCE.refusals.resetRepeatedTest : GUIDANCE.refusals.resetRepeatedEnd, {
    lastReset: { briefId: before.briefId, outcome: before.outcome, reason: before.reason },
    leftOnTarget: left.acts.map((act) => ({ act: act.act, did: act.did, brief: act.brief, undoable: act.undoable })),
    ...(left.lastWholeTrialLeftActs ? { lastWholeTrialLeftActs: true } : {})
  }, { retry: true });
}

/** What is left on the target, as one comparable key. */
function leftKey(left: AutomationStudioProjectSupervisorLeftOnTarget): string {
  return JSON.stringify({ acts: left.acts.map((act) => [act.act, act.undoable]).sort(), trial: left.lastWholeTrialLeftActs });
}

/** The return the dispatcher gave for this brief, or a blocked one saying why it does not answer it. */
function answering(brief: AutomationStudioProjectSubflowBrief, given: AutomationStudioProjectBuilderReturn | undefined): AutomationStudioProjectBuilderReturn {
  if (!given) return blocked(brief, "project.return_missing");
  const parsed = automationStudioProjectBuilderReturn.parse(JSON.parse(JSON.stringify(given)));
  if (parsed.status === "invalid") return blocked(brief, parsed.code);
  const issue = automationStudioProjectBuilderReturn.issues(parsed.value, brief)[0];
  return issue ? blocked(brief, issue.code, parsed.value) : parsed.value;
}

function usd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function blocked(brief: AutomationStudioProjectSubflowBrief, code: string, given?: AutomationStudioProjectBuilderReturn): AutomationStudioProjectBuilderReturn {
  return { briefId: brief.briefId, outcome: "blocked", reason: `The return did not answer this brief (${code}).`, trials: [], spentUsd: given?.spentUsd ?? 0, calls: given?.calls ?? 0 };
}

/**
 * What a not-done return says of the trial a repair of its subflow starts from
 * (t606): the closest to passing of every trial that subflow's returns listed,
 * which Core puts on a repair naming a trial it ranks below.
 */
const REPAIR_FROM = "Of every trial this subflow's returns listed, this is the closest to passing (unsure over no, then the most rows stored, then the latest). A repair of this subflow starts from it: copy it whole as the repair's failingReceipt. A repair naming a trial that ranks below it is sent with this one instead.";

/** What the supervisor reads of a return: never the builder's history. */
function compact(brief: AutomationStudioProjectSubflowBrief, returned: AutomationStudioProjectBuilderReturn, sameAs: { briefId: string; revision: number } | undefined, closest: AutomationStudioProjectTrialRef | undefined): JsonObject {
  return {
    briefId: brief.briefId,
    kind: brief.kind,
    subflowKey: brief.subflowKey,
    outcome: returned.outcome,
    reason: returned.reason,
    // What Core gave it (`./brief-sizing.ts`).
    given: { allowanceUsd: usd(brief.allowanceUsd), maxIterations: brief.maxIterations, ...(brief.maxCalls !== undefined ? { maxCalls: brief.maxCalls } : {}) },
    ...(returned.proposal ? { proposal: { revision: returned.proposal.revision } } : {}),
    // A proposal doing exactly what the one it replaces did (header, t595).
    ...(sameAs ? { changedNothing: { sameAs, instruction: GUIDANCE.issues.changedNothing } } : {}),
    // Each trial's receipt ref, as a repair brief's failingReceipt names one (bigbox debug fix 5, t588).
    trials: returned.trials.map((trial) => ({ kind: trial.kind, receiptId: trial.receiptId, digest: trial.digest })),
    // What each answered and stored, beside the refs (t606); a ref is copied without them.
    ...(returned.trials.some((trial) => trial.verdict !== undefined) ? { trialsAnswered: returned.trials.map((trial) => ({ receiptId: trial.receiptId, ...(trial.verdict !== undefined ? { verdict: trial.verdict } : {}), ...(trial.rows !== undefined ? { rows: trial.rows } : {}) })) } : {}),
    // The subflow's trial closest to passing, for a repair to start from, while this return is not done (`../contracts/builder-return.ts`, t606).
    ...(closest && returned.outcome !== "done" ? { repairFrom: { failingReceipt: RETURN.trialRef(closest), instruction: REPAIR_FROM } } : {}),
    spentUsd: returned.spentUsd,
    calls: returned.calls,
    ...(returned.interfaceRequest ? { interfaceRequest: { change: returned.interfaceRequest.change, why: returned.interfaceRequest.why } } : {}),
    ...(returned.findings ? { findings: [...returned.findings] } : {})
  };
}
