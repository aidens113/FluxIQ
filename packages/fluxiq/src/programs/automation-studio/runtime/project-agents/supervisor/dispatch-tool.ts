import type { JsonObject } from "../../../../../core/index.ts";
import { emitAutomationStudioProjectBriefCard, emitAutomationStudioProjectReturnCard } from "../../activity/project/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioProjectBuilderReturn, type AutomationStudioProjectBuilderReturn, type AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import { AutomationStudioProjectRecordRefusal } from "../record/index.ts";
import { automationStudioProjectSupervisorBriefInput } from "./brief-input.ts";
import { automationStudioProjectSupervisorBriefSizing } from "./brief-sizing.ts";
import type { AutomationStudioProjectSupervisorContext } from "./context.ts";
import { automationStudioProjectSupervisorDispatchOrder } from "./dispatch-order.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";
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
 */
export async function automationStudioProjectSupervisorDispatchTool(context: AutomationStudioProjectSupervisorContext, value: JsonObject): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { ports, state } = context;
  const structure = state.structure;
  const taskSpec = state.taskSpec;
  if (!structure || !taskSpec) return answer.refused("project.plan_missing", GUIDANCE.refusals.noPlan);
  const sent = Array.isArray(value.briefs) ? value.briefs.filter((brief): brief is JsonObject => Boolean(brief) && typeof brief === "object" && !Array.isArray(brief)) : [];
  // Only a list of objects is sized; anything else is refused by the reading below, by its place.
  const sizing = ports.purse && Array.isArray(value.briefs) && sent.length === value.briefs.length && sent.length
    ? automationStudioProjectSupervisorBriefSizing({ sent, purse: ports.purse, structure, done: new Set(state.latestDone().keys()), supervisorCalls: ports.finishing?.supervisorCalls ?? 0 })
    : undefined;
  if (sizing && !sizing.ok) {
    const { ok: _ok, ...figures } = sizing;
    return answer.refused("project.allowance_unavailable", GUIDANCE.refusals.allowanceUnavailable, { ...figures, canGiveUsd: usd(figures.canGiveUsd) });
  }
  const read = automationStudioProjectSupervisorBriefInput({ value, structure, taskSpec, after: state.after, ...(sizing ? { sizes: sizing.sizes } : {}), nextId: state.briefIds() });
  if (!read.ok) {
    const survey = read.issues.some((issue) => issue.code === "project.brief_survey_unavailable");
    return answer.refused(survey ? "project.brief_survey_unavailable" : "project.brief_refused", survey ? GUIDANCE.refusals.surveyUnavailable : GUIDANCE.refusals.briefRefused, { issues: read.issues });
  }
  const order = automationStudioProjectSupervisorDispatchOrder(read.briefs, new Set(state.latestDone().keys()));
  if (!order.ok) return answer.refused(order.code === "cycle" ? "project.dispatch_cycle" : "project.predecessor_not_done", order.code === "cycle" ? GUIDANCE.refusals.dispatchCycle : GUIDANCE.refusals.predecessorNotDone, { issues: order.issues });
  const requestedUsd = order.ordered.reduce((sum, brief) => sum + brief.allowanceUsd, 0);
  const canGiveUsd = ports.purse?.allocatableUsd();
  if (canGiveUsd !== undefined && requestedUsd > canGiveUsd + EPSILON_USD) return answer.refused("project.allowance_unavailable", GUIDANCE.refusals.allowanceUnavailable, { requestedUsd, canGiveUsd });
  const earlier = state.answeredUnderPlan();
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
  const allDone = returns.every((returned) => returned.outcome === "done");
  const reset = order.ordered.every((brief) => brief.kind === "reset");
  return answer.answered({
    ok: true,
    returns: order.ordered.map((brief, index) => compact(brief, returns[index]!)),
    lastingActsInPlace: ports.projectLedger.snapshot().acts.filter((act) => act.inPlace).length,
    next: !allDone ? GUIDANCE.next.afterReturnsNotDone : reset ? GUIDANCE.next.afterReset : GUIDANCE.next.afterReturnsDone
  }, { acted: true });
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

/** What the supervisor reads of a return: never the builder's history. */
function compact(brief: AutomationStudioProjectSubflowBrief, returned: AutomationStudioProjectBuilderReturn): JsonObject {
  return {
    briefId: brief.briefId,
    kind: brief.kind,
    subflowKey: brief.subflowKey,
    outcome: returned.outcome,
    reason: returned.reason,
    // What Core gave it (`./brief-sizing.ts`).
    given: { allowanceUsd: usd(brief.allowanceUsd), maxIterations: brief.maxIterations, ...(brief.maxCalls !== undefined ? { maxCalls: brief.maxCalls } : {}) },
    ...(returned.proposal ? { proposal: { revision: returned.proposal.revision } } : {}),
    trials: returned.trials.length,
    spentUsd: returned.spentUsd,
    calls: returned.calls,
    ...(returned.interfaceRequest ? { interfaceRequest: { change: returned.interfaceRequest.change, why: returned.interfaceRequest.why } } : {}),
    ...(returned.findings ? { findings: [...returned.findings] } : {})
  };
}
