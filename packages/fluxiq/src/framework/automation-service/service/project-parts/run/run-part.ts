// The one way a saved part runs: for a person through `run-project-part`, for a build
// through `core.run_part`.
//
// A run reads the version it names and its snapshot; reads the page with one zero-wait
// batch of facts; asks the guard; and only then touches anything. What it executes is a
// throwaway root that calls a copy of the saved graph (`./run-only-graphs.ts`), in a
// real runtime session whose metadata says it is a part run. It runs as a trial of a
// Flow does, no model in it: no diagnosis, no patch, no judge, each step keeping the
// automatic retries every step has and the written `on failed:` routes its graph
// declares. Every step passes the gate first (`./step-gate.ts`), which is where a lasting
// act is checked against what was asked and the page is looked at one last time.
//
// The session belongs to the root, not to the Flow the part was first saved from: a part
// outlives that Flow, and its runs are not that Flow's runs.
import { randomUUID } from "node:crypto";
import type { AutomationStudioAttemptActClass } from "@fluxiq/contracts/automation";
import type { RunProjectPartResponse } from "../../../../../api-contracts/automation.ts";
import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioRootInvocation } from "../../../../../engine/automation/frames/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../../../../../engine/automation/trace/index.ts";
import type { AutomationStudioFlowNode, ExecutableGraph } from "../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionPermissionCheck } from "../../../../../runtime/action-permission-requests/index.ts";
import { automationStudioPartGuard, automationStudioPartClassWords } from "../../../../../runtime/project-parts/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../composite-executor.ts";
import { automationStudioOptionalStepWayOn, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../../executor/index.ts";
import { automationStudioCandidateFrameEvidence, automationStudioCandidateTrialLandedActs } from "../../candidate-trial/index.ts";
import type { AutomationStudioRunDatasets } from "../../datasets/index.ts";
import { canonicalFlowDocument } from "../../flows/index.ts";
import { automationStudioRunGraphOptions, automationStudioRequestedRunId } from "../../runtime-session/index.ts";
import { automationStudioProjectPartControlKeys } from "../control-keys.ts";
import type { AutomationStudioProjectPartsDependencies } from "../library-types.ts";
import { withProjectPartStores } from "../stores.ts";
import { readProjectPartRunClosure, type ProjectPartRunEntry } from "./closure.ts";
import { projectPartWhileDriving } from "./driving-gate.ts";
import { projectPartRunOutcome } from "./outcome.ts";
import { readProjectPartPage } from "./page-read.ts";
import { projectPartRecheck } from "./recheck.ts";
import { projectPartRowTarget } from "./row-target.ts";
import { projectPartRunOnlyGraphs } from "./run-only-graphs.ts";
import { projectPartSettledCalls } from "./settled-calls.ts";
import { projectPartStepClasses } from "./step-classes.ts";
import { projectPartStepGate } from "./step-gate.ts";
import type { AutomationStudioProjectPartRunInput, AutomationStudioProjectPartRunRefusal, AutomationStudioProjectPartRunResult } from "./types.ts";

const UNAVAILABLE: AutomationStudioProjectPartRunRefusal = { ok: false, code: "parts.unavailable", message: "This project's library of saved parts is not available right now." };
const CALLS_NOT_AVAILABLE: AutomationStudioProjectPartRunRefusal = { ok: false, code: "part.calls_not_available", message: "This part calls another part that is not available, so it was not run." };
const CALL_CYCLE: AutomationStudioProjectPartRunRefusal = { ok: false, code: "part.call_cycle", message: "This part ends up calling itself, so it was not run: it would never come back out." };
const CALL_TOO_DEEP: AutomationStudioProjectPartRunRefusal = { ok: false, code: "part.call_too_deep", message: "This part calls parts that call parts too many levels deep, so it was not run." };
const REPEAT_REFUSED: AutomationStudioProjectPartRunRefusal = { ok: false, code: "part.repeat_refused", message: "This part already did its lasting acts in this build, so it was not run again." };
const RUN_ID_REFUSED: AutomationStudioProjectPartRunRefusal = { ok: false, code: "parts.run_id_refused", message: "That run id cannot be used for a new run." };
const DEFAULT_CONTROL_KEYS: ReadonlySet<string> = new Set(["target"]);

export async function runProjectPartNow(deps: AutomationStudioProjectPartsDependencies, input: AutomationStudioProjectPartRunInput): Promise<AutomationStudioProjectPartRunResult | AutomationStudioProjectPartRunRefusal> {
  const collaborators = deps.run?.collaborators();
  if (!deps.pool || !deps.run || !collaborators) return UNAVAILABLE;
  const closure = await withProjectPartStores(deps.pool, input.projectId, (stores) => readProjectPartRunClosure(stores, input.partId, input.version));
  if ("ok" in closure) return UNAVAILABLE;
  if (closure.kind === "calls_not_available") return CALLS_NOT_AVAILABLE;
  if (closure.kind === "call_cycle") return CALL_CYCLE;
  if (closure.kind === "call_too_deep") return CALL_TOO_DEEP;
  const inputs: Record<string, JsonValue> = { ...(input.inputs ?? {}) };
  const part = closure.kind === "found" ? closure.root : undefined;
  const executor = collaborators.executor();
  // A part that is not there is answered as one: nothing asks who is on the page for it.
  if (!part) return await guarded(deps, input, closure, inputs);
  return await projectPartWhileDriving({
    hostResources: executor.hostRuntime?.hostResources, holder: input.newRunId ?? randomUUID(), ports: deps.run.driving, projectId: input.projectId, caller: input.caller,
    work: async () => await guarded(deps, input, closure, inputs)
  });
}

/** From the read of the page on: asked while the run holds the host, so nothing moves the page under the guard's answer. */
async function guarded(deps: AutomationStudioProjectPartsDependencies, input: AutomationStudioProjectPartRunInput, closure: Extract<Awaited<ReturnType<typeof readProjectPartRunClosure>>, { kind: "found" | "not_found" }>, inputs: Record<string, JsonValue>): Promise<AutomationStudioProjectPartRunResult | AutomationStudioProjectPartRunRefusal> {
  const part = closure.kind === "found" ? closure.root : undefined;
  const asked = { caller: input.caller, inputs, permittedConsequences: input.permittedConsequences, acknowledgedRepeat: input.acknowledgedRepeat };
  const executor = deps.run!.collaborators()!.executor();
  const page = part
    ? await readProjectPartPage({ hostRuntime: executor.hostRuntime, sites: part.card.sites, conditions: part.snapshot.start.conditions, inputs, signal: input.signal })
    : { origin: undefined, startFacts: [] };
  const answer = automationStudioPartGuard({ card: part?.card, snapshot: part?.snapshot, asked, page });
  if ("refused" in answer) return { ok: false, code: answer.refused, message: answer.message, ...(answer.classes ? { classes: answer.classes } : {}) };
  if (closure.kind !== "found" || !part) return { ok: false, code: "part.not_found", message: "That saved part is not in this project's library." };
  if (part.card.lastingClasses.length && input.repeated?.({ partId: part.card.partId, version: part.card.version })) return REPEAT_REFUSED;
  const runId = await runIdOf(deps, input);
  if (typeof runId !== "string") return runId;
  return await executed(deps, input, { ...closure, root: part }, inputs, runId);
}

async function runIdOf(deps: AutomationStudioProjectPartsDependencies, input: AutomationStudioProjectPartRunInput): Promise<string | AutomationStudioProjectPartRunRefusal> {
  if (input.newRunId === undefined) return randomUUID();
  try {
    return await automationStudioRequestedRunId({ getRuntimeSession: (projectId, runId) => deps.run!.getRuntimeSession(projectId, runId) }, { projectId: input.projectId, newRunId: input.newRunId }) ?? randomUUID();
  } catch {
    return RUN_ID_REFUSED;
  }
}

async function executed(
  deps: AutomationStudioProjectPartsDependencies,
  input: AutomationStudioProjectPartRunInput,
  closure: { root: ProjectPartRunEntry; entries: ReadonlyMap<string, ProjectPartRunEntry> },
  inputs: Record<string, JsonValue>,
  runId: string
): Promise<AutomationStudioProjectPartRunResult> {
  const { projectId } = input;
  const collaborators = deps.run!.collaborators()!;
  const executor = collaborators.executor();
  const { card } = closure.root;
  const graphs = projectPartRunOnlyGraphs({ projectId, root: closure.root, entries: closure.entries, givenInputs: Object.keys(inputs) });
  const snapshots = await collaborators.catalogue().listPublishedFlowSnapshots();
  const deprecated = (await collaborators.catalogue().listFlowPublicationRecords()).filter((record) => record.status === "deprecated").map((record) => `${record.flowId}@${record.version}`);
  const startedAt = Date.now();
  const opened: AutomationStudioRuntimeSession = {
    schemaVersion: "0.1", runId, projectId, targetKind: "flow", targetId: graphs.root.flowId, flowId: graphs.root.flowId, status: "running", queuedAt: startedAt, startedAt,
    flow: canonicalFlowDocument(graphs.root),
    metadata: { partRun: { partId: card.partId, version: card.version, caller: input.caller }, inputs: Object.fromEntries(Object.keys(inputs).map((key) => [key, AUTOMATION_STUDIO_WITHHELD_VALUE])), authorizedDomainIds: [] }
  };
  await collaborators.writeRuntimeSession(projectId, opened);
  const abort = new AbortController();
  const onAbort = () => abort.abort(input.signal?.reason);
  if (input.signal?.aborted) onAbort(); else input.signal?.addEventListener("abort", onAbort, { once: true });
  const run = deps.run!.openRun(projectId, runId, abort);
  const permission = stepPermission(input);
  const native = executor.nativeNodeRuntime;
  const classesOf = (node: AutomationStudioFlowNode) => projectPartStepClasses(node, native?.resolveActionEffect(node));
  const gate = projectPartStepGate({
    person: run.gate,
    nodeOf: graphs.nodeOf,
    classesOf,
    permitted: new Set(input.permittedConsequences ?? []),
    permission,
    recheck: async (node, row) => {
      const controlKeys = automationStudioProjectPartControlKeys(deps.run) ?? DEFAULT_CONTROL_KEYS;
      const rowTarget = row ? (await projectPartRowTarget({ native, node, row, controlKeys, signal: abort.signal })) ?? "none" : undefined;
      return await projectPartRecheck({ node, rowTarget, hostRuntime: executor.hostRuntime, controlKeys, inputs, projectId, flowId: graphs.root.flowId, signal: abort.signal });
    }
  });
  const datasets = collaborators.runDatasets();
  const conversations = collaborators.conversations();
  const base = automationStudioRunGraphOptions({
    inputs, referenceNow: startedAt, signal: abort.signal, ...executor, authorizedDomainIds: [],
    ...(datasets.available ? { onRecordBatch: datasets.recordBatchHandler(projectId, runId) } : {}),
    ...(conversations.available ? { parking: conversations.parkingPort({ projectId, subject: { kind: "run", id: runId } }) } : {})
  });
  const doors = input.settled || input.admit ? projectPartSettledCalls(base, { classesOf, settled: input.settled, admit: input.admit, held: (node, answer) => gate.stopFor(node, answer === "already_done" ? "act_done" : "act_may_have_landed") }) : base;
  const options: AutomationStudioGraphExecutionOptions = {
    ...doors, runControl: gate, subflowGraphs: graphs.source, allowLlmDiagnosis: false, approvedRuntimePatchNodeIds: [], recoveryBudget: failedRouteBudget(graphs.root)
  };
  options.invocation = automationStudioRootInvocation(graphs.root, options, async (target, childOptions, onExecuted) => {
    const child = graphs.copyOf(target.subflowId);
    if (!child) return { status: "failed", startedAt: Date.now(), finishedAt: Date.now(), attempts: [], values: {}, effects: [], message: "This part's graph could not be read." };
    return await runCanonicalAutomationStudioFlow(child, snapshots, { ...childOptions, allowLlmDiagnosis: false, approvedRuntimePatchNodeIds: [], recoveryBudget: failedRouteBudget(child) }, deprecated, onExecuted);
  });
  let trace: AutomationStudioGraphExecutionTrace | undefined;
  let executedTrace: AutomationStudioGraphExecutionTrace | undefined;
  try {
    trace = await runCanonicalAutomationStudioFlow(graphs.root, snapshots, options, deprecated, (ran) => { executedTrace = ran; });
  } catch (error) {
    // The executor answers every failure as a trace; this is a fault outside it, and a run left "running" would say nothing of it.
    await collaborators.writeRuntimeSession(projectId, { ...opened, status: "failed", finishedAt: Date.now(), metadata: { ...opened.metadata, partRun: { partId: card.partId, version: card.version, caller: input.caller, outcome: "failed" } } });
    throw error;
  } finally {
    input.signal?.removeEventListener("abort", onAbort);
    run.close();
  }
  const rows = datasets.available ? await rowsOf(datasets, projectId, runId) : undefined;
  const frames = automationStudioCandidateFrameEvidence(trace.attempts, graphs.root, graphs.copies);
  const landed = automationStudioCandidateTrialLandedActs(trace, frames.graph);
  const outcome = projectPartRunOutcome({ trace, executed: executedTrace, gate: gate.stopped(), aborted: abort.signal.aborted, outputIds: card.outputs.map((port) => port.id), landed, nodeOf: graphs.nodeOf });
  await collaborators.writeRuntimeSession(projectId, { ...opened, status: trace.status, finishedAt: trace.finishedAt ?? Date.now(), trace, metadata: { ...opened.metadata, partRun: { partId: card.partId, version: card.version, caller: input.caller, outcome: outcome.status } } });
  const finishedAtMs = Date.now();
  await withProjectPartStores(deps.pool, projectId, async (stores) => {
    await stores.parts.recordRun({ partId: card.partId, version: card.version, runId, outcome: outcome.status === "succeeded" ? "succeeded" : outcome.status === "failed" ? "failed" : "stopped", modelCalls: 0, finishedAtMs });
  });
  return { response: { runId, ...outcome, ...(rows ? { rows } : {}), modelCalls: 0 }, landedActs: landed, partId: card.partId, version: card.version, ...(gate.stopped() ? { stoppedFor: gate.stopped()!.reason } : {}) };
}

/** A person's run has a gate of its own; a build hands in the check its own gate makes, so one gate holds both. */
function stepPermission(input: AutomationStudioProjectPartRunInput) {
  const own = new AutomationStudioActionPermissionGate({ permittedConsequences: input.permittedConsequences, stage: "authoring", endsOnRequest: false });
  return (node: AutomationStudioFlowNode, classes: { classes: readonly AutomationStudioAttemptActClass[] }) => {
    const check: AutomationStudioActionPermissionCheck = input.permission ?? own.checkFor({ kind: "flow_step", id: node.definitionId, ref: node.id });
    return check({ consequences: [...classes.classes], control: { name: automationStudioPartClassWords([...classes.classes]) || "a step of a saved part" }, verb: "run", effect: "mutate" });
  };
}

/** What the run stored, once its datasets became their answers. A run whose rows cannot be listed still answers, and says so. */
async function rowsOf(datasets: Pick<AutomationStudioRunDatasets, "processEndedRunDatasets" | "listRunDatasetsForVerification">, projectId: string, runId: string): Promise<RunProjectPartResponse["rows"]> {
  try {
    await datasets.processEndedRunDatasets({ projectId, runId });
    const stored = await datasets.listRunDatasetsForVerification({ projectId, runId });
    return stored.length ? { runId, datasets: stored.map((dataset) => ({ datasetId: dataset.datasetId, rowCount: dataset.recordCount })) } : undefined;
  } catch {
    return { runId, datasets: [], unread: true };
  }
}

/** Only the graph's own written `on failed:` routes, each once, with no model or patch allowance, as a trial runs one (`detached/execution.ts`). */
function failedRouteBudget(graph: Pick<ExecutableGraph, "nodes" | "edges">) {
  const optionalWayOns = new Set(graph.nodes.map((node) => automationStudioOptionalStepWayOn(graph, node)?.id).filter((id) => id !== undefined));
  const written = graph.edges.filter((edge) => edge.sourcePortId === "failed" && !optionalWayOns.has(edge.id)).length;
  return { maxRecoveryAttemptsPerSubflow: written, maxReroutesPerRun: written, maxAdaptationOrLlmAttemptsPerRun: 0 };
}
