// A from-step run of a subflow builder's proposal (t804; the rule "a failed
// test is repaired live on the failing step and checked by running from that
// step on the page as it stands"). The validator side of
// `core.test_subflow {from}`, offered as the trial port's `fromStep`
// (`./port.ts`).
//
// It is never the part's test. Next to a partial trial (`./run.ts`) it runs
// no start hook, no site reset, no arrival, no predecessors, no offline check,
// no before-state readings and no judge, and it opens no traced trial
// episode, so a later offline trial never takes it for the part's last live
// test. What it does is:
//
// 1. Refuse, with nothing run, a proposal of another scope
//    (`subflow.trial_identity_mismatch`), a step that is not the subflow's
//    (`subflow.from_step_unknown`), and a step from which the run would read
//    a value no step before it in the run makes (`subflow.from_step_unbound`,
//    `./from-step-binding.ts`): a from-step run seeds no values.
// 2. Open a runtime session marked as a partial trial of the brief, as
//    `./run.ts` does, with `fromStep` naming the step, so it is admitted as a
//    build's trial (`../runtime-session/build-trial-admission.ts` reads only
//    the build, the brief and the lease).
// 3. Run the target's proposal from that step as the root frame
//    (`runAutomationStudioDetachedSubflowFrom`), on the tab as it stands.
// 4. Answer which of its steps passed and where it stopped, by plan key
//    (`./stopped-at.ts`), with bounded feedback in the trial's own words
//    (`../candidate-trial/feedback.ts`) and every lasting act that landed, for
//    the gate to add to the build's ledger.
//
// **A run that started past the subflow's first steps still ended.** The
// executor fails a frame that reaches its last step while some of its nodes
// were never visited (`executor.graph.unvisited_nodes`), and the steps before
// the start are never visited. That ending is read as `ended` when every
// unvisited step is one the run could not reach from its start (or a loop body
// whose list had no rows, as the executor itself excuses); a step it could
// reach and skipped is still a stop.
//
// A cancelled build is not an answer: the abort is thrown, as a trial throws it.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { automationStudioLiveRunEnvironment } from "../../environment/index.ts";
import { automationStudioZeroPassLoopBodies } from "../../executor/graph-navigation/index.ts";
import type { AutomationStudioSubflowFromStepRequest, AutomationStudioSubflowFromStepResult, AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import { runAutomationStudioDetachedSubflowFrom, type AutomationStudioCandidateStartReceipt, type AutomationStudioDetachedSubflowIdentity, type AutomationStudioDetachedSubflowProposal, type AutomationStudioDetachedSubflowResult } from "../../flow-bootstrap/verification/index.ts";
import { automationStudioCandidateFrameEvidence, automationStudioCandidateTrialFeedback as Feedback, automationStudioCandidateTrialLandedActs, automationStudioTrialExecutorOptions } from "../candidate-trial/index.ts";
import { automationStudioSubflowFromStepOrder, automationStudioSubflowFromStepUnbound } from "./from-step-binding.ts";
import { automationStudioSubflowTrialOwnAttempts, automationStudioSubflowTrialPassedKeys, automationStudioSubflowTrialStoppedAtKey } from "./stopped-at.ts";
import type { AutomationStudioSubflowTrialPorts } from "./types.ts";

/** The executor's code for a frame that ended with nodes it never visited. */
const UNVISITED = "executor.graph.unvisited_nodes";
/** What the run's `start` is said as: nothing put the site back, and nothing ran before the step. */
const START = "from_step";

/** What the builder is told beside every from-step answer. Generic words. */
export const AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS = Object.freeze({
  ran: "Not the part's test: this ran your subflow from the step named under from, on the page as it stood, with no start hook, no reset, no start page, no earlier subflow and no judge.",
  ended: "Every step it ran passed and it reached the end of your subflow.",
  stopped: "It stopped at the step named under stoppedAt; steps lists what each step did.",
  unbound: "Nothing ran: a step from there reads a value made by an earlier step the run would not reach first, named under producer. Run from that step or one before it.",
  inputUnbound: "Nothing ran: a step from there reads an input your subflow is given, named under input, and a run from a step is given none. Run from an earlier step that makes the value, or test the subflow whole.",
  unknown: "Nothing ran: your subflow has no step with the key under from. Name one of its steps by its key.",
  notRun: "Nothing ran, for the reason under code."
});

/** Runs `request`'s proposal from its step `fromKey` (header); refusals answer `not_run` with nothing done on the site. */
export async function runAutomationStudioSubflowFromStep(request: AutomationStudioSubflowFromStepRequest, ports: AutomationStudioSubflowTrialPorts): Promise<AutomationStudioSubflowFromStepResult> {
  const environment = ports.environment ?? automationStudioLiveRunEnvironment;
  return await environment.within(() => fromStepIn(request, ports));
}

async function fromStepIn(request: AutomationStudioSubflowFromStepRequest, ports: AutomationStudioSubflowTrialPorts): Promise<AutomationStudioSubflowFromStepResult> {
  const { signal, scope, proposal, fromKey } = request;
  const environment = ports.environment ?? automationStudioLiveRunEnvironment;
  signal.throwIfAborted();
  const answer = answerFor(request);
  if (!proposalOf(scope, proposal)) return answer("not_run", { code: "subflow.trial_identity_mismatch", said: AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.notRun });
  const target = proposal.subflows[0]!;
  const unbound = automationStudioSubflowFromStepUnbound(target, fromKey);
  if (unbound) {
    const said = !("reader" in unbound) ? AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.unknown : "input" in unbound ? AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.inputUnbound : AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.unbound;
    const { code, ...named } = unbound;
    return answer("not_run", { code, ...structuredClone(named), said });
  }
  const identity = await identityOf(scope, proposal, ports);
  if (!identity) return answer("not_run", { code: "subflow.trial_build_gone", said: AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.notRun });
  const runId = ports.newRunId?.() ?? environment.newRunId("subflow-trial");
  const now = ports.now ?? environment.now;
  const marker = { buildId: scope.buildId, briefId: scope.briefId, subflowKey: scope.subflowKey, revision: proposal.revision, digest: proposal.digest, fromStep: fromKey };
  const opened = await ports.openSession({ runId, metadata: { subflowTrial: { ...marker } } });
  const startedAt = now();
  await ports.writeSession({ ...opened, status: "running", startedAt });
  const receipt: AutomationStudioCandidateStartReceipt = { receiptId: `${runId}.start`, conditionsDigest: `subflow-trial.${START}`, preparedAt: startedAt, pageGeneration: 0, subjectStates: [] };
  let executed: AutomationStudioDetachedSubflowResult;
  try {
    executed = await (ports.executeFrom ?? runAutomationStudioDetachedSubflowFrom)({
      identity,
      target: { subflowKey: proposal.scope.subflowKey, revision: proposal.revision, digest: proposal.digest, subflows: structuredClone(proposal.subflows) as AutomationStudioDetachedSubflowProposal["subflows"] },
      fromKey,
      currentIdentity: async () => identityOf(scope, proposal, ports),
      parentFlow: await ports.parentFlow(),
      ...(ports.registry ? { registry: ports.registry } : {}),
      resolution: ports.resolution,
      snapshots: await ports.snapshots(),
      deprecatedPublicationIds: await ports.deprecatedPublicationIds(),
      sourceInstructionIds: [...ports.sourceInstructionIds],
      runId,
      start: receipt,
      // The signal rides on the options alone, as a trial's does: the runner refuses two different signals.
      options: automationStudioTrialExecutorOptions(ports.graphOptions({ runId, signal }), ports.environment)
    });
  } catch (error) {
    await ports.writeSession({ ...opened, status: signal.aborted ? "cancelled" : "failed", startedAt, finishedAt: now() });
    throw error;
  } finally {
    await ports.processDatasets(runId);
  }
  const ended = endedHere(executed, target, fromKey);
  const ran: AutomationStudioRuntimeSession = {
    ...opened,
    status: ended ? "succeeded" : executed.trace?.status ?? (executed.receipt.status === "succeeded" ? "succeeded" : executed.receipt.status === "cancelled" ? "cancelled" : "failed"),
    startedAt,
    finishedAt: executed.receipt.finishedAt,
    ...(executed.trace ? { trace: executed.trace } : {}),
    metadata: { ...(opened.metadata ?? {}), subflowTrial: { ...marker, start: START, execution: ended ? "succeeded" : executed.receipt.status, ...(executed.code && !ended ? { code: executed.code } : {}) } }
  };
  await ports.writeSession(ran);
  signal.throwIfAborted();
  const frames = automationStudioCandidateFrameEvidence(executed.trace?.attempts ?? [], executed.graph, executed.candidateGraphs);
  ports.exploredToggles?.trial(frames.attempts, frames.graph);
  const acts = automationStudioCandidateTrialLandedActs(executed.trace, frames.graph);
  const passedKeys = automationStudioSubflowTrialPassedKeys(executed, scope.subflowKey);
  // A run refused before its first step (stale, plan invalid, step not in the graph) did nothing.
  if (!ended && executed.receipt.status === "not_run") {
    return answer("not_run", { code: executed.code ?? "candidate.trial_not_run", ...(executed.planIssues?.length ? { planIssues: [...executed.planIssues] } : {}), said: AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.notRun }, { trialRunId: runId });
  }
  const code = ended ? undefined : executed.code ?? `candidate.trial_${executed.receipt.status}`;
  const shown = Feedback.executionFailed({ code: code ?? "subflow.from_step_ended", trialRunId: runId, trace: executed.trace, graph: frames.graph, start: START }).feedback;
  // A run that ended has no failure to say: its graph-level ending is the steps before its start, never a fault (header).
  const { code: _code, graphEnding, ...listing } = shown;
  if (ended) return answer("ended", { ...listing, said: `${AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.ran} ${AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.ended}` }, { trialRunId: runId, passedKeys, acts });
  const stoppedAtKey = automationStudioSubflowTrialStoppedAtKey(executed, scope.subflowKey);
  return answer("stopped", { code: code!, ...listing, ...(graphEnding ? { graphEnding } : {}), ...(stoppedAtKey ? { stoppedAt: stoppedAtKey } : {}), said: `${AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.ran} ${AUTOMATION_STUDIO_SUBFLOW_FROM_STEP_WORDS.stopped}` },
    { trialRunId: runId, passedKeys, acts, ...(stoppedAtKey ? { stoppedAtKey } : {}), code: code! });
}

/**
 * Whether the run reached its end (header): it succeeded, or the executor
 * failed it only for steps the run could not reach from its start.
 */
function endedHere(executed: AutomationStudioDetachedSubflowResult, target: AutomationStudioSubflowProposal["subflows"][number], fromKey: string): boolean {
  if (executed.receipt.status === "succeeded") return true;
  const trace = executed.trace;
  if (executed.receipt.status !== "failed" || !trace || trace.failure?.code !== UNVISITED || !executed.graph) return false;
  const own = automationStudioSubflowTrialOwnAttempts(executed, target.key);
  if (!own.length) return false;
  const reachable = new Set(automationStudioSubflowFromStepOrder(target, fromKey));
  const ran = new Set(own.map(({ key }) => key));
  const emptyLoops = new Set(automationStudioZeroPassLoopBodies(executed.graph, own.map(({ attempt }) => attempt)));
  return !executed.graph.nodes.some((node) => {
    const key = keyOf(node);
    return key !== undefined && reachable.has(key) && !ran.has(key) && !emptyLoops.has(node.id);
  });
}

function keyOf(node: AutomationStudioFlowArtifact["nodes"][number]): string | undefined {
  const key = node.metadata?.bootstrapSymbolicKey;
  return typeof key === "string" ? key : undefined;
}

/** The proposal is bound to exactly this scope and heads with its subflow, as a trial's must (`./run.ts`). */
function proposalOf(scope: AutomationStudioSubflowScope, proposal: Readonly<AutomationStudioSubflowProposal>): boolean {
  const bound = proposal.scope;
  return bound.buildId === scope.buildId && bound.briefId === scope.briefId && bound.planDigest === scope.planDigest && bound.subflowKey === scope.subflowKey
    && proposal.subflows[0]?.key === scope.subflowKey;
}

/** What the runner is bound to now, with no predecessors; null once the build's plan is gone. */
async function identityOf(scope: AutomationStudioSubflowScope, proposal: Readonly<AutomationStudioSubflowProposal>, ports: AutomationStudioSubflowTrialPorts): Promise<AutomationStudioDetachedSubflowIdentity | null> {
  const planDigest = ports.currentPlanDigest ? await ports.currentPlanDigest(scope.buildId) : scope.planDigest;
  if (planDigest === null) return null;
  return {
    projectId: ports.projectId, flowId: ports.flowId, buildId: scope.buildId, briefId: scope.briefId, planDigest,
    baseDependencyDigest: await ports.currentBaseDigest(),
    target: { subflowKey: proposal.scope.subflowKey, revision: proposal.revision, digest: proposal.digest },
    predecessors: []
  };
}

/** The builder's answer for one from-step run of `request`'s proposal. */
function answerFor(request: AutomationStudioSubflowFromStepRequest) {
  const identity = { buildId: request.scope.buildId, briefId: request.scope.briefId, planDigest: request.scope.planDigest, subflowKey: request.scope.subflowKey };
  return (
    status: AutomationStudioSubflowFromStepResult["status"],
    feedback: JsonObject,
    ran: { trialRunId?: string; passedKeys?: string[]; acts?: AutomationStudioSubflowFromStepResult["acts"]; stoppedAtKey?: string; code?: string } = {}
  ): AutomationStudioSubflowFromStepResult => {
    const code = ran.code ?? (status === "not_run" && typeof feedback.code === "string" ? feedback.code : undefined);
    return {
      fromStep: true,
      identity: { ...identity },
      revision: request.proposal.revision,
      digest: request.proposal.digest,
      fromKey: request.fromKey,
      status,
      passedKeys: [...(ran.passedKeys ?? [])],
      ...(ran.stoppedAtKey ? { stoppedAtKey: ran.stoppedAtKey } : {}),
      ...(code ? { code } : {}),
      feedback: { fromStep: true, from: request.fromKey, status, passed: status === "ended", ...(ran.passedKeys ? { passedKeys: [...ran.passedKeys] } : {}), ...feedback },
      ...(ran.trialRunId ? { trialRunId: ran.trialRunId } : {}),
      ...(ran.acts?.length ? { acts: ran.acts } : {})
    };
  };
}
