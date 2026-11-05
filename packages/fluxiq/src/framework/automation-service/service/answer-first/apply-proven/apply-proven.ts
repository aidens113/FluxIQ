// A Flow a later attempt proved goes into the person's Flow, with no question (t870, the lead's
// instruction), through the one path every other Flow takes: `createFlowBootstrapAdaptation`, then
// approve and apply, as "runtime". There is no second writer here.
//
// **A person's own edits are never replaced.** The task remembers the Flow's dependency digest its
// steps were last known against (`../task-memory/flow-base.ts`): from when the Flow was first saved
// blank, and again right after this applies one. Only a Flow still at that digest is changed, and
// that digest is what is handed to the path as the proposal's base, so the path's own compare under
// its own lock refuses a Flow that moved after this read (`FLOW_BOOTSTRAP_STALE`, at the proposal and
// again at apply). Anything else means someone changed the Flow: it stays a draft, the memory says
// so, and the route goes on using the saved steps. A Flow holding work when first seen is the same.
//
// **Its own earlier apply is not a person's edit.** The digest still matches, so a repaired Flow
// proven by its own whole run replaces it, as an `extend` keeping the Router, Subflow and graph ids.
// Node ids are new: the steps may have moved, so pairing them with the old nodes would be a guess.
//
// **Nobody is asked.** A question can only come from a request carried on the proposal
// (`../../flow-bootstrap-commands/permission-hold.ts`) and this carries none: the attempt's own
// permission before its run covered what the Flow declares (`../flow-run/permission.ts`), and a
// decline means no run and so nothing here. What the gate already holds is stored as a build stores
// it, read with no model: its cross-check is left out, since that may pay for a read.
//
// **The result is already safe.** This runs after it is stored and is best-effort. A failure costs
// this apply, says part of the record was not written, and is tried again on the next proven run. A
// proposal left behind would stop a person's next build, so it is taken back. A person's Stop starts
// nothing new, and is no failure to tell anyone about.

import { automationStudioBootstrapExtendSubflow, automationStudioBootstrapTargetRefusal, type AutomationStudioBootstrapExistingTopology } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "../../candidate-drafts/index.ts";
import { automationStudioAnswerFirstStepsDigest, type AutomationStudioAnswerFirstFlowBase } from "../task-memory/index.ts";
import type { AutomationStudioAnswerFirstFlowWriter } from "./flow-writer.ts";
import type { AutomationStudioAnswerFirstProvenAttempt } from "./proven-attempt.ts";
import { automationStudioAnswerFirstProvenRun } from "./proven-run.ts";

const ACTOR = "runtime";
const STALE = "FLOW_BOOTSTRAP_STALE";
const EVERYWHERE = { minX: -1, minY: -1, maxX: 1, maxY: 1 };

/** Records the Flow's base where none is known, and applies a proven Flow onto it. `ok: false` is a failure the caller says out loud. */
export async function automationStudioAnswerFirstApplyProven(run: AutomationStudioAnswerFirstProvenAttempt, ending: string, draft: { record?: AutomationStudioFlowCandidateDraftRecord | undefined }): Promise<{ ok: boolean }> {
  const stopped = (): boolean => run.input.cancellation.signal()?.aborted === true;
  const done = await tried(async () => {
    const proposed = run.steps.filter(automationStudioFlowDraftStepIsProposed);
    if (proposed.length === 0) return;
    const base = await baseOf(run);
    const stepsDigest = automationStudioAnswerFirstStepsDigest(proposed);
    if (!automationStudioAnswerFirstProvenRun(run, ending, stepsDigest) || !base || !draft.record || stopped()) return;
    await applied(run, base, stepsDigest, draft.record);
  });
  return { ok: done || stopped() };
}

/** What this task knows of the Flow, first seen now if it knows nothing. None while that cannot be said yet. */
async function baseOf(run: AutomationStudioAnswerFirstProvenAttempt): Promise<AutomationStudioAnswerFirstFlowBase | undefined> {
  const { projectId, flowId, baseDependencyDigest } = run.input;
  const known = (await run.memory.get(projectId, run.taskId))?.flowBases?.find((base) => base.flowId === flowId);
  if (known) return known;
  if (!(await isBlank(run.input.owner, projectId, flowId))) return await keptAsDraft(run, { flowId });
  // It moved during this attempt, so what the steps were known against is not known. Blank, so nothing is at risk: the next ending looks again.
  if ((await run.input.owner.getLlmExecutionDependencyDigest(projectId, flowId)) !== baseDependencyDigest) return undefined;
  // The first look at a Flow's graph indexes it, which moves its digest, and looking is no edit: so that first look happens here, once, before the digest is kept. Where there is no graph store to index, nothing moves.
  await tried(() => run.input.owner.getFlowGraphViewport({ projectId, flowId, bounds: EVERYWHERE, limit: 1 }));
  const base = { flowId, digest: await run.input.owner.getLlmExecutionDependencyDigest(projectId, flowId) };
  await written(run, base);
  return base;
}

async function isBlank(writer: AutomationStudioAnswerFirstFlowWriter, projectId: string, flowId: string): Promise<boolean> {
  const [flow, router, subflows] = await Promise.all([writer.getFlow(projectId, flowId), writer.getFlowRouter(projectId, flowId), writer.listFlowSubflowSummaries({ projectId, flowId, limit: 1, offset: 0 })]);
  return automationStudioBootstrapTargetRefusal({ mode: "create", representation: "orchestration", parentNodeCount: flow.nodes.length, parentEdgeCount: flow.edges.length, hasRouter: Boolean(router), subflowCount: subflows.total }) === undefined;
}

/** The compare, then the path, whose own compare under its lock is the one that counts (header). */
async function applied(run: AutomationStudioAnswerFirstProvenAttempt, base: AutomationStudioAnswerFirstFlowBase, stepsDigest: string, record: AutomationStudioFlowCandidateDraftRecord): Promise<void> {
  const { projectId, flowId, owner } = run.input;
  const { digest } = base;
  if (digest === undefined) return;
  if ((await owner.getLlmExecutionDependencyDigest(projectId, flowId)) !== digest) {
    await keptAsDraft(run, base);
    return;
  }
  if (base.applied?.stepsDigest === stepsDigest) return;
  const adaptationId = await proposal(run, base, digest, record).catch(async (error: unknown) => {
    if (!isStale(error)) throw error;
    await keptAsDraft(run, base);
    return undefined;
  });
  if (adaptationId === undefined) return;
  const review = (action: "approve" | "reject" | "apply") => owner.reviewFlowBootstrapAdaptation({ projectId, flowId, adaptationId, action, actorId: ACTOR });
  let appliedDigest: string | undefined;
  try {
    await review("approve");
    appliedDigest = (await review("apply")).application?.appliedDependencyDigest;
  } catch (error) {
    await tried(() => review("reject"));
    if (!isStale(error)) throw error;
    await keptAsDraft(run, base);
    return;
  }
  await written(run, {
    flowId,
    digest: appliedDigest ?? await owner.getLlmExecutionDependencyDigest(projectId, flowId),
    applied: { attemptId: run.attemptId, adaptationId, stepsDigest, atMs: Date.now() }
  });
}

/** The Flow's change as a proposal on the base the steps were known against, carrying no request of any person. */
async function proposal(run: AutomationStudioAnswerFirstProvenAttempt, base: AutomationStudioAnswerFirstFlowBase, digest: string, record: AutomationStudioFlowCandidateDraftRecord): Promise<string> {
  const { projectId, flowId, owner, instructionIds } = run.input;
  const instructed = run.permissions.instructed();
  const declarations = run.permissions.declarations();
  const replacing = base.applied ? await existingIds(owner, projectId, flowId) : undefined;
  const { adaptationId } = await owner.createFlowBootstrapAdaptation({
    projectId, flowId, baseDependencyDigest: digest, sourceInstructionIds: [...instructionIds], summary: record.candidate.summary, buildPlan: record.candidate.buildPlan, actorId: ACTOR,
    ...(replacing ? { mode: "extend" as const, origin: { entryPoint: "edge_case" as const, instructionIds: [...instructionIds] }, existingIds: replacing } : {}),
    ...(instructed?.length ? { instructedConsequences: [...instructed] } : {}),
    ...(declarations.length ? { declaredConsequences: [...declarations] } : {})
  });
  return adaptationId;
}

/** The ids of what this task applied before. A Flow whose Subflows do not say which one that was is not changed: the throw reads as a failure and costs this apply. */
async function existingIds(writer: AutomationStudioAnswerFirstFlowWriter, projectId: string, flowId: string): Promise<AutomationStudioBootstrapExistingTopology> {
  const [router, { subflows }] = await Promise.all([writer.getFlowRouter(projectId, flowId), writer.listFlowSubflowSummaries({ projectId, flowId, limit: 50, offset: 0 })]);
  const subflow = automationStudioBootstrapExtendSubflow(subflows);
  if (!subflow) throw new Error("The Flow does not say which of its parts to replace.");
  return { ...(router ? { routerId: router.routerId } : {}), subflowId: subflow.subflowId, graphFlowId: subflow.graphFlowId };
}

/** Whether `work` went through. What failed goes no further: its words may quote a value, and none of this may cost the attempt its result. */
async function tried(work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch {
    return false;
  }
}

function isStale(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(STALE);
}

async function keptAsDraft(run: AutomationStudioAnswerFirstProvenAttempt, base: AutomationStudioAnswerFirstFlowBase): Promise<AutomationStudioAnswerFirstFlowBase> {
  const held = { ...base, keptAsDraftSinceMs: base.keptAsDraftSinceMs ?? Date.now() };
  await written(run, held);
  return held;
}

async function written(run: AutomationStudioAnswerFirstProvenAttempt, base: AutomationStudioAnswerFirstFlowBase): Promise<void> {
  await run.memory.update(run.input.projectId, run.taskId, (current) => ({ ...current, flowBases: [...(current.flowBases ?? []).filter((each) => each.flowId !== base.flowId), base] }));
}
