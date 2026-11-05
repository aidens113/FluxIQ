// A repair a run made to a saved version, kept. A version never changes, so the fix becomes
// the next version, and only the call steps that ran it in a run judged to answer move to it.
// Every other caller stays exactly where it was.
//
// It is reached through the apply every adaptation goes through, and it asks for the judged
// yes itself, off the run's own record: nothing moves on anyone's word that a run passed.
//
// **A call inside a saved version.** Its caller is a version too, which cannot change. So the
// caller gets its next version as well, calling the fixed one, and so on up to the first step
// that belongs to a Flow. That whole chain is what the judged run ran.
//
// **Several fixes in one run.** Each is written on what the fix before it left: a caller that
// has moved already, by this same run, is not a caller someone else changed. Any other pin
// than the one the run ran is a change nobody tested this against, and the fix is refused.
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioPartCallPaths, automationStudioPinOfSubflowId, automationStudioPinnedSubflowId, automationStudioPartPinOf, type AutomationStudioPartCallStep, type AutomationStudioPartPin } from "../../../../../engine/automation/frames/index.ts";
import { validateAutomationStudioFlow, type AutomationStudioFlowAdaptation, type AutomationStudioFlowArtifact, type AutomationStudioFlowValidationContext, type AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioFlowVersionsFromMetadata } from "../../../../../runtime/flow-authoring/version/index.ts";
import { AutomationStudioProjectFlowGraphJudgementStore, type AutomationStudioProjectDatabasePool } from "../../../../persistence/automation/index.ts";
import { automationStudioGraphFlowWithAdaptationPatch, durableAdaptationMutationRecord, type AutomationStudioAdaptationPatches } from "../../adaptations/index.ts";
import { compactJsonObject } from "../../compact-json.ts";
import type { AutomationStudioFlowWriter } from "../../flows/index.ts";
import { isJsonRecord } from "../../json-values.ts";
import { AutomationStudioProjectPartControlKeys } from "../control-keys.ts";
import { projectPartRunGraphOf, readProjectPartRunClosure, type ProjectPartRunEntry } from "../run/index.ts";
import { withProjectPartStores, type AutomationStudioProjectPartStores } from "../stores.ts";
import { PROJECT_PART_REPAIR_METADATA_KEY, projectPartWriteNextVersion, type ProjectPartNextVersion } from "./next-version.ts";

export type ProjectPartPinnedRepairPorts = {
  pool: AutomationStudioProjectDatabasePool | undefined;
  getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> | undefined;
  instructionBodies(projectId: string, flowId: string): Promise<readonly string[]>;
  patches: Pick<AutomationStudioAdaptationPatches, "resolveFlowNodeAdaptationTarget">;
  flowWriter: Pick<AutomationStudioFlowWriter, "saveFlowInternal">;
};

type Change = AutomationStudioFlowAdaptation["patch"][number];
type GraphBefore = { flow: AutomationStudioFlowArtifact; validation: AutomationStudioFlowValidationContext };

/** The pin an adaptation's fix is for, when it is a fix to a saved version. */
export function projectPartPinOfAdaptation(adaptation: Pick<AutomationStudioFlowAdaptation, "subflowId">): AutomationStudioPartPin | undefined {
  return automationStudioPinOfSubflowId(adaptation.subflowId);
}

/** The next version written, and the steps that ran it moved. Throws, moving nothing, when it cannot; the apply records why. */
export async function applyProjectPartPinnedRepair(ports: ProjectPartPinnedRepairPorts, adaptation: AutomationStudioFlowAdaptation, patch: Change, now: number): Promise<JsonObject[]> {
  if (adaptation.patch.length !== 1) throw new Error(`A repair of a saved part names one unit and changes nothing else, and ${adaptation.adaptationId} carries ${adaptation.patch.length} changes; refused.`);
  const session = await judgedRunOf(ports, adaptation);
  const paths = automationStudioPartCallPaths(session.trace?.attempts ?? [], adaptation.subflowId!);
  if (!paths.length) throw new Error("part.repair_not_run: no step of the judged run finished this saved part, so nothing moves.");
  const requestWords = (await ports.instructionBodies(adaptation.projectId, adaptation.flowId)).join("\n");
  const moved: JsonObject[] = [];
  const undo: GraphBefore[] = [];
  const written: ProjectPartNextVersion[] = [];
  try {
    for (const path of paths) moved.push(...await keepOnePath({ ports, adaptation, patch, now, session, path, requestWords, undo, written }));
    await creditJudgedRun(ports, adaptation, session, written, now);
  } catch (error) {
    // No mutation has reached the apply's own rollback yet. A version already written stays: it was judged, and nobody calls it.
    for (const before of undo.reverse()) await ports.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: before.flow, validation: before.validation }, false);
    throw error;
  }
  return moved;
}

/** The run behind the fix, with its judged yes. A fix whose run has none is not kept, whoever asks. */
async function judgedRunOf(ports: ProjectPartPinnedRepairPorts, adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioRuntimeSession> {
  const session = adaptation.sourceRunId ? await ports.getRuntimeSession(adaptation.projectId, adaptation.sourceRunId) : null;
  const verdict = isJsonRecord(session?.metadata?.resultVerification) ? session.metadata.resultVerification : undefined;
  if (!session || session.status !== "succeeded" || verdict?.performed !== true || verdict.verdict !== "answers") throw new Error("part.repair_not_judged: a fix to a saved part is kept only after a whole run that ran it was judged to answer.");
  return session;
}

/** One path of calls: the versions it ran read as they stand now, the fix written on the innermost, each caller's next version, and the Flow's step moved. */
async function keepOnePath(step: {
  ports: ProjectPartPinnedRepairPorts;
  adaptation: AutomationStudioFlowAdaptation;
  patch: Change;
  now: number;
  session: AutomationStudioRuntimeSession;
  path: readonly AutomationStudioPartCallStep[];
  requestWords: string;
  undo: GraphBefore[];
  written: ProjectPartNextVersion[];
}): Promise<JsonObject[]> {
  const { ports, adaptation, session, path } = step;
  const firstPinned = path.findIndex((call) => automationStudioPinOfSubflowId(call.target));
  const owner = path[firstPinned];
  if (!owner) throw new Error("part.repair_not_run: the step that ran this saved part could not be read.");
  const ownerSubflowId = owner.frame ?? automationStudioFlowVersionsFromMetadata(session.metadata).find((version) => version.subflowId)?.subflowId;
  const target = await ports.patches.resolveFlowNodeAdaptationTarget({ ...adaptation, ...(ownerSubflowId ? { subflowId: ownerSubflowId } : {}) });
  const calling = path.slice(firstPinned);
  const moved = await withProjectPartStores(ports.pool, adaptation.projectId, async (stores) => {
    const chain = await versionsAsTheyStand(stores, adaptation, calling, target.graphFlow);
    return await writtenUpTheChain(step, stores, chain, calling);
  });
  if ("ok" in moved) throw new Error("part.repair_library_unavailable: the library could not be reached, so nothing moved.");
  step.written.push(...moved.written);
  const after = withCallAt(target.graphFlow, owner.nodeId, moved.top, step.now);
  if (after === target.graphFlow) return [];
  step.undo.push({ flow: target.graphFlow, validation: target.validation });
  const saved = await ports.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: after, validation: target.validation }, false);
  return [durableAdaptationMutationRecord({
    patchKind: step.patch.kind,
    artifactKind: "flow",
    artifactId: saved.flowId,
    targetKind: "subflow",
    targetId: target.subflowId ?? saved.flowId,
    before: target.graphFlow,
    after: saved,
    validation: validateAutomationStudioFlow(saved, target.validation),
    ...(target.subflowId ? { rollback: compactJsonObject({ kind: "restore_owned_subflow_graph", parentFlowId: adaptation.flowId, subflowId: target.subflowId, graphFlowId: saved.flowId }) } : {})
  })];
}

/** Each version along the path, from the Flow's step down, as it stands now. */
async function versionsAsTheyStand(stores: AutomationStudioProjectPartStores, adaptation: AutomationStudioFlowAdaptation, calling: readonly AutomationStudioPartCallStep[], ownerGraph: AutomationStudioFlowArtifact): Promise<ProjectPartRunEntry[]> {
  const chain: ProjectPartRunEntry[] = [];
  for (const [at, call] of calling.entries()) {
    const ran = automationStudioPinOfSubflowId(call.target);
    const above = chain[at - 1];
    const stands = above ? above.calls.get(call.nodeId) : automationStudioPartPinOf(ownerGraph.nodes.find((node) => node.id === call.nodeId)?.parameterValues?.part);
    if (!ran || !stands) throw new Error("part.repair_caller_changed: the step that ran this saved part no longer calls it, so nothing moved.");
    const entry = await entryAt(stores, stands);
    if ((stands.partId !== ran.partId || stands.version !== ran.version) && !movedByThisRun(entry, adaptation)) throw new Error("part.repair_caller_changed: the step that ran this saved part has been changed since, so the fix was never tested against it and nothing moved.");
    chain.push(entry);
  }
  return chain;
}

async function entryAt(stores: AutomationStudioProjectPartStores, pin: AutomationStudioPartPin): Promise<ProjectPartRunEntry> {
  const closure = await readProjectPartRunClosure(stores, pin.partId, pin.version);
  if (closure.kind !== "found") throw new Error(`part.repair_version_unreadable: a version this fix builds on could not be read (${closure.kind}), so nothing moved.`);
  return closure.root;
}

function movedByThisRun(entry: ProjectPartRunEntry, adaptation: Pick<AutomationStudioFlowAdaptation, "sourceRunId">): boolean {
  const made = entry.snapshot.graph.metadata?.[PROJECT_PART_REPAIR_METADATA_KEY];
  return isJsonRecord(made) && made.runId === adaptation.sourceRunId;
}

/** The fix on the innermost version, then each caller's next version calling what was just written. */
async function writtenUpTheChain(
  step: { ports: ProjectPartPinnedRepairPorts; adaptation: AutomationStudioFlowAdaptation; patch: Change; now: number; requestWords: string },
  stores: AutomationStudioProjectPartStores,
  chain: readonly ProjectPartRunEntry[],
  calling: readonly AutomationStudioPartCallStep[]
): Promise<{ top: AutomationStudioPartPin; written: ProjectPartNextVersion[] }> {
  const { adaptation } = step;
  const write = async (base: ProjectPartRunEntry, graph: AutomationStudioFlowArtifact) => await projectPartWriteNextVersion({
    store: stores.parts,
    base,
    graph,
    flowId: adaptation.flowId,
    runId: adaptation.sourceRunId!,
    requestWords: step.requestWords,
    controlParameterKeys: step.ports.pool ? AutomationStudioProjectPartControlKeys.of(step.ports.pool) : undefined,
    now: step.now
  });
  const graphOf = (entry: ProjectPartRunEntry) => projectPartRunGraphOf({ projectId: adaptation.projectId, parentFlowId: adaptation.flowId, entry }).artifact;
  const innermost = chain.at(-1)!;
  const written = [await write(innermost, automationStudioGraphFlowWithAdaptationPatch(graphOf(innermost), adaptation, step.patch, step.now))];
  for (let at = chain.length - 2; at >= 0; at -= 1) {
    const base = chain[at]!;
    written.push(await write(base, withCallAt(graphOf(base), calling[at + 1]!.nodeId, written.at(-1)!.pin, step.now)));
  }
  return { top: written.at(-1)!.pin, written };
}

/** The graph with one call step at another version, and nothing else changed; the same graph when it is there already. */
function withCallAt(graph: AutomationStudioFlowArtifact, nodeId: string, pin: AutomationStudioPartPin, now: number): AutomationStudioFlowArtifact {
  const current = automationStudioPartPinOf(graph.nodes.find((node) => node.id === nodeId)?.parameterValues?.part);
  if (current?.partId === pin.partId && current.version === pin.version) return graph;
  return { ...graph, updatedAt: now, nodes: graph.nodes.map((node) => (node.id === nodeId ? { ...node, parameterValues: { ...(node.parameterValues ?? {}), part: { partId: pin.partId, version: pin.version } } } : node)) };
}

/** A judged run ran each version it just made, so the verdict is theirs: their trust starts from it, and others can be told one passed. */
async function creditJudgedRun(ports: ProjectPartPinnedRepairPorts, adaptation: AutomationStudioFlowAdaptation, session: AutomationStudioRuntimeSession, written: readonly ProjectPartNextVersion[], now: number): Promise<void> {
  if (!ports.pool || !written.length) return;
  const verdict = isJsonRecord(session.metadata?.resultVerification) ? session.metadata.resultVerification : {};
  const store = await AutomationStudioProjectFlowGraphJudgementStore.open({ pool: ports.pool, projectId: adaptation.projectId });
  try {
    await store.record({
      runId: session.runId,
      status: "confirmed",
      code: typeof verdict.code === "string" ? verdict.code : "result_verification.answers",
      instructionDigest: typeof verdict.instructionDigest === "string" ? verdict.instructionDigest : null,
      decidedAtMs: session.finishedAt ?? now,
      versions: written.map((version) => ({ graphFlowId: version.source.graphFlowId, revision: version.source.revision, subflowId: automationStudioPinnedSubflowId(version.pin) }))
    });
  } finally {
    await store.close();
  }
}
