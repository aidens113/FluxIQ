// The run session's side of in-run model repair (state-aware recovery plan,
// C6 step 8, C12 "Unit repair, in the run first"): the `repairIncident`
// callback the executor calls when a true failure holds the run at its failing
// step.
//
// It is supplied for adapting runs only: the run's adaptation context is what
// invokes the model, so a run whose context does not invoke one, or creates no
// adaptations, or only suggests them, gets no callback and ends as it always
// did; and so does a run a person asked the model into for a diagnosis or a
// proposal (`diagnosis_only`, `diagnose_and_adapt`), whose fix must never run.
//
// For each incident the callback runs the one recovery pipeline a run that
// could not hold gets after it ends (`../../recovery/annotation/annotate.ts`):
// its gates, interventions, diagnosis at `gather`, deterministic plan,
// exploration, patch at `implement`, permission gate, budget and usage records.
// It is entered here, while the run is held, with `inRun`
// (`../../recovery/annotation/in-run.ts`):
//
// 1. the patch request carries the unit, its contract, the incident and what
//    the run already tried and did, and the plan offers `add_handler` and
//    `replace_unit` beside today's kinds;
// 2. each patch is held to the plan's kinds, the incident's unit (C12, a
//    change to no other: `./in-run-repair-unit.ts`) and the recovery's
//    permission gate, passed through the detached path's preflight, and
//    overlaid with `overlayAutomationStudioRuntimePatch`; a refusal anywhere is
//    `none`;
// 3. each fix is recorded as a pending adaptation of this run, with its review
//    record when it is structural, and the promotion gate holds any unattended
//    apply for the run's judged end (`../runtime-adaptation/judged-promotion.ts`);
// 4. what the recovery recorded -- interventions, gate, trace -- is kept on the
//    run's ledger and joins the run detail as a recovery after the run would.
//
// Nothing is saved to the Flow here. The executor re-attempts the unit on the
// overlaid graph; that attempt is the fix's trial, and the judged whole run is
// its evidence.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { automationStudioConsequencesInOrder, type AutomationStudioActionConsequence, type AutomationStudioActionPermissionGate } from "../../action-permissions/index.ts";
import { emitAutomationStudioActivityThought } from "../../activity/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor/index.ts";
import type { AutomationStudioIncidentRepair, AutomationStudioIncidentRepairRequest, AutomationStudioRepairUnit } from "../../executor/lifecycle-run/index.ts";
import { prepareAutomationStudioInRunRepair, type AutomationStudioInRunRepairPreparation } from "../../live-patch.ts";
import type { AutomationStudioRuntimePatch, AutomationStudioRuntimePatchUnit, AutomationStudioRuntimeSessionLlm } from "../../llm/index.ts";
import {
  annotateAutomationStudioRunDetailWithRuntimeLlm,
  automationStudioInRunRepairSlot,
  automationStudioRecoveryTargetEvidenceCheck,
  automationStudioRepairUnitContract,
  type AutomationStudioInRunRecovery,
  type AutomationStudioRuntimeRecoveryPorts
} from "../../recovery/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { canonicalFlowDocument } from "../flows/index.ts";
import { isJsonRecord } from "../json-values.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../runtime-adaptation/index.ts";
import { runtimeSessionToFlowRunDetail } from "../summaries/index.ts";
import { AutomationStudioInRunRepairLedger } from "./in-run-repair-ledger.ts";
import { automationStudioInRunRepairUnitRefusal } from "./in-run-repair-unit.ts";

export type AutomationStudioInRunRepairBinding = {
  context: AutomationStudioRuntimeAdaptationContext;
  /** The run's executor options, which gain `repairIncident` when the run adapts. */
  graphOptions: AutomationStudioGraphExecutionOptions;
  ports: AutomationStudioRuntimeRecoveryPorts;
  runId: string;
  llmExecution?: AutomationStudioRuntimeSessionLlm | undefined;
  permittedConsequences?: readonly AutomationStudioActionConsequence[] | undefined;
  authorizedExternalSideEffects?: boolean | undefined;
  useReusableContext?: true | undefined;
  now?: (() => number) | undefined;
};

type Purse = AutomationStudioInRunRecovery["purse"];
type PatchInput = Parameters<AutomationStudioInRunRecovery["apply"]>[0];

/**
 * Supplies `repairIncident` on an adapting run and returns the context with
 * the run's ledger of in-run repairs on it; any other run's context comes back
 * unchanged, and its options gain nothing.
 */
export function bindAutomationStudioInRunRepair(input: AutomationStudioInRunRepairBinding): AutomationStudioRuntimeAdaptationContext {
  if (!repairsInRun(input.context, input.llmExecution)) return input.context;
  const ledger = new AutomationStudioInRunRepairLedger();
  const purse: Purse = {};
  // The recovery reads the ledger off the context it is given, as the one after the run does.
  const repairing: AutomationStudioInRunRepairBinding = { ...input, context: { ...input.context, inRunRepairs: ledger } };
  input.graphOptions.repairIncident = (request) => repairIncident(repairing, ledger, purse, request);
  return repairing.context;
}

/** Only a run whose context invokes the model, keeps what it makes, and may run a fix: not a dry run, and not a lane that only diagnoses or proposes. */
function repairsInRun(context: AutomationStudioRuntimeAdaptationContext, llmExecution: AutomationStudioRuntimeSessionLlm | undefined): boolean {
  if (llmExecution?.intent === "diagnosis_only" || llmExecution?.intent === "diagnose_and_adapt") return false;
  return context.behavior.invokeLlm && context.behavior.createAdaptations && context.settings.metadata?.dryRunAdaptation !== true;
}

/** Why an in-run repair ended with no fix: the recovery's own gate code, or the applier's. */
type Refusal = { code: string; reason: string };

type Applied = {
  graph: AutomationStudioFlowDocument;
  part?: AutomationStudioFlowDocument;
  unit: AutomationStudioRepairUnit;
  prepared: Array<Extract<AutomationStudioInRunRepairPreparation, { ok: true }>>;
  /** What the fix changed, in the model's own words for each patch. */
  summary?: string;
};

/** What the applier left for the callback: the overlay to hand the executor, or why there is none. */
type Fix = { applied?: Applied; refusal?: Refusal; receipts: JsonObject[] };

async function repairIncident(
  input: AutomationStudioInRunRepairBinding,
  ledger: AutomationStudioInRunRepairLedger,
  purse: Purse,
  request: AutomationStudioIncidentRepairRequest
): Promise<AutomationStudioIncidentRepair> {
  const repairId = `repair.${input.runId}.${request.incident.incidentId}`;
  const at = { nodeId: request.failedAttempt.nodeId, framePath: request.framePath };
  const base = { repairId, incidentId: request.incident.incidentId, nodeId: at.nodeId, framePath: [...at.framePath], unit: request.unit as unknown as JsonObject };
  const refuse = (refusal: Refusal): AutomationStudioIncidentRepair => {
    ledger.record(compactJsonObject({ ...base, outcome: "none", code: refusal.code, reason: refusal.reason, ...spent(purse, input.runId) }));
    return { kind: "none", reason: refusal.reason };
  };
  if (!ledger.ask(request.incident.incidentId, at)) return { kind: "none", reason: "This incident was already asked about once in this run." };
  if (request.signal?.aborted) return refuse({ code: "model_call_failed", reason: "The run was stopped before a fix was asked for." });
  emitAutomationStudioActivityThought({ phase: "repairing", title: "Fixing a step", text: `The step failed for good (${request.incident.origin.failureCode}); looking for a fix to it.`, max: 480 });
  const partSubflowId = request.unit.kind === "part" ? request.unit.subflowId : undefined;
  const part = partSubflowId ? await partGraphFor(input, ledger, request, partSubflowId).then((graph) => ({ graph }), () => ({ unreadable: true as const })) : { graph: undefined };
  if ("unreadable" in part) return refuse({ code: "evidence_unavailable", reason: "The part that broke its contract could not be read, so no model was asked." });
  const partGraph = part.graph;
  const contract = automationStudioRepairUnitContract({ graph: request.graph, unit: request.unit, partGraph, deniedEvidenceKeys: input.ports.llmEvidenceRuntime?.deniedEvidenceKeys });
  const fix: Fix = { receipts: [] };
  const recovered = await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: input.ports,
    detail: runSoFar(input, request),
    context: input.context,
    runtimeFlow: request.graph,
    ...(request.subflowId ? { subflowId: request.subflowId } : {}),
    failedTraceAttempt: request.failedAttempt,
    ...(input.authorizedExternalSideEffects !== undefined ? { authorizedExternalSideEffects: input.authorizedExternalSideEffects } : {}),
    graphOptions: input.graphOptions,
    ...(input.llmExecution ? { llmExecution: input.llmExecution } : {}),
    ...(input.permittedConsequences?.length ? { permittedConsequences: input.permittedConsequences } : {}),
    ...(input.useReusableContext ? { useReusableContext: true as const } : {}),
    inRun: {
      slot: automationStudioInRunRepairSlot({ request, contract }),
      purse,
      apply: async (patches) => await applyInRun({ input, request, patches, partSubflowId, partGraph, base, purse, fix })
    }
  }).catch((error: unknown) => {
    // The executor reads a throw as no fix; the recovery after the run throws it again (`../runtime-adaptation/contracts.ts`, `fault`).
    ledger.recordFault(error);
    throw error;
  });
  ledger.recordRecovery(recoveryRecord(recovered));
  const applied = fix.applied;
  if (!applied) return refuse(fix.refusal ?? noFix(recovered));
  for (const receipt of fix.receipts) ledger.record(receipt);
  if (partSubflowId && applied.part) ledger.keepPartGraph(partSubflowId, applied.part);
  ledger.keepOverlay({ repairId, framePath: [...request.framePath], graph: applied.graph });
  return {
    kind: "overlay",
    repairId,
    unit: applied.unit,
    graph: applied.graph,
    ...(partSubflowId && applied.part ? { partGraph: { subflowId: partSubflowId, graph: applied.part } } : {}),
    ...(applied.summary ? { reason: applied.summary } : {})
  };
}

/**
 * The pipeline's resolution stage, held in place: the patches overlaid and
 * each fix recorded. Returns what the run detail records; the overlay waits on
 * `fix` for the callback to hand the executor.
 */
async function applyInRun(step: {
  input: AutomationStudioInRunRepairBinding;
  request: AutomationStudioIncidentRepairRequest;
  patches: PatchInput;
  partSubflowId: string | undefined;
  partGraph: AutomationStudioFlowDocument | undefined;
  base: JsonObject;
  purse: Purse;
  fix: Fix;
}): Promise<{ attempts: JsonObject[]; adaptationIds: string[]; changeProposalIds: string[] }> {
  const applied = await applyPatches(step.input, step.request, step.patches, step.partSubflowId, step.partGraph);
  if ("code" in applied) return refusedPatches(step, applied);
  const receipts: JsonObject[] = [];
  try {
    for (const prepared of applied.prepared) receipts.push(await recordFix(step.input, step.base, prepared, step.purse));
  } catch {
    // A fix that could not be recorded could never be saved, so it does not run either.
    return refusedPatches(step, { code: "unrecorded", reason: "The fix could not be recorded for review, so it was not used." });
  }
  step.fix.applied = applied;
  step.fix.receipts = receipts;
  return {
    attempts: [],
    adaptationIds: receipts.flatMap((receipt) => (typeof receipt.adaptationId === "string" ? [receipt.adaptationId] : [])),
    changeProposalIds: receipts.flatMap((receipt) => (typeof receipt.changeProposalId === "string" ? [receipt.changeProposalId] : []))
  };
}

/**
 * A refused answer, kept for the callback and recorded as the run detail
 * records every patch that never ran (`../../recovery/annotation/patches.ts`):
 * one receipt that says why, which never asks the detached path to run again.
 */
function refusedPatches(step: { patches: PatchInput; fix: Fix }, refusal: Refusal): { attempts: JsonObject[]; adaptationIds: string[]; changeProposalIds: string[] } {
  step.fix.refusal = refusal;
  const kinds = [...new Set(step.patches.patches.map((patch) => patch.kind))];
  const attempt = compactJsonObject({
    kind: kinds.length === 1 ? kinds[0] : "runtime_patch_response",
    inRun: true,
    executed: false,
    preflightOk: false,
    restoredExpectedState: false,
    retryOriginalAction: false,
    code: refusal.code,
    issues: [refusal.reason],
    traceStatus: "not-run"
  });
  return { attempts: [attempt], adaptationIds: [], changeProposalIds: [] };
}

/** Each patch, in order, held to the plan's kinds, the request's unit, the permission gate and the preflight, and overlaid on the graph the one before it left. */
async function applyPatches(
  input: AutomationStudioInRunRepairBinding,
  request: AutomationStudioIncidentRepairRequest,
  answer: PatchInput,
  partSubflowId: string | undefined,
  partGraph: AutomationStudioFlowDocument | undefined
): Promise<Applied | Refusal> {
  let graph = request.graph;
  let part = partGraph;
  let unit: AutomationStudioRepairUnit | undefined;
  const prepared: Applied["prepared"] = [];
  const startedAt = input.now?.() ?? Date.now();
  const targetCheck = automationStudioRecoveryTargetEvidenceCheck({ ports: input.ports, failureEvidence: answer.failureEvidence, explorationEvidence: answer.explorationEvidence });
  for (const [index, patch] of answer.patches.entries()) {
    if (!answer.allowedPatchKinds.includes(patch.kind)) return { code: "patch_refused", reason: `The fix used ${describeKind(patch.kind)}, which is not allowed for this failure.` };
    // C12: the incident's unit only, read off the patch before anyone is asked about it.
    const declared = automationStudioInRunRepairUnitRefusal({ requested: request.unit, patch });
    if (declared) return declared;
    const permission = await permissionFor(answer.permissionGate, patch, request);
    // A replaced part is a change to the part's own graph, and is filed under its Subflow.
    const subflowId = patch.kind === "replace_unit" && patch.unit.kind === "part" ? patch.unit.subflowId : request.subflowId;
    if (permission.outcome === "undeclared") return { code: "consequences_undeclared", reason: "The fix did not say what it would lastingly do, so it was not used." };
    if (permission.outcome === "required") return { code: "permission_required", reason: permission.sentence };
    const result = prepareAutomationStudioInRunRepair({
      projectId: input.context.projectId,
      flowId: input.context.flowId,
      ...(subflowId ? { subflowId } : {}),
      runId: input.runId,
      flow: graph,
      patch,
      failedAttempt: request.failedAttempt,
      ...(request.failedAttempt.transitionComparison ? { expectedComparison: request.failedAttempt.transitionComparison } : {}),
      policy: input.context.policy,
      proposalMode: input.context.policy.proposalMode,
      ...(permission.outcome === "permitted" ? { sideEffectPermission: "permitted" as const } : {}),
      // A target is judged against the packet the model was shown it in, as after the run.
      ...(targetCheck ? { validateTargetOverrideEvidence: (target, failedAction) => targetCheck(target, failedAction).validation } : {}),
      options: input.graphOptions,
      ...(partSubflowId && part ? { subflowGraphs: { [partSubflowId]: part } } : {}),
      // Several fixes of one answer are recorded the same moment; each keeps an id of its own.
      now: () => startedAt + index
    });
    if (!result.ok) return { code: "patch_refused", reason: `The fix could not be used: ${result.reason}` };
    // And off the overlay, which knows a node in a handler's body for the handler's.
    const outside = automationStudioInRunRepairUnitRefusal({ requested: request.unit, patch, changedUnit: result.overlay.changedUnit });
    if (outside) return outside;
    const changed = repairUnit(result.overlay.changedUnit);
    if (unit && !sameUnit(unit, changed)) return { code: "other_unit", reason: "The fix changed more than one unit." };
    unit = changed;
    graph = result.overlay.flow;
    if (result.overlay.partGraph) part = result.overlay.partGraph;
    prepared.push(result);
  }
  const summary = answer.patches.flatMap((patch) => (typeof patch.reason === "string" && patch.reason.trim() ? [patch.reason.trim()] : [])).join(" ");
  return { graph, ...(part && part !== partGraph ? { part } : {}), unit: unit ?? request.unit, prepared, ...(summary ? { summary } : {}) };
}

/**
 * Whether the recovery's gate lets a fix that acts run. A wait or a reroute
 * does not act of itself. A step, a handler's body, a replaced unit and a new
 * target do, and say what they would lastingly do; a fix that says nothing does
 * not run, and with no gate to ask none runs.
 */
async function permissionFor(gate: AutomationStudioActionPermissionGate | undefined, patch: AutomationStudioRuntimePatch, request: AutomationStudioIncidentRepairRequest): Promise<{ outcome: "not_acting" | "permitted" | "undeclared" } | { outcome: "required"; sentence: string }> {
  if (patch.kind !== "temporary_target_override" && patch.kind !== "temporary_action_sequence" && patch.kind !== "add_handler" && patch.kind !== "replace_unit") return { outcome: "not_acting" };
  if (patch.consequences === undefined) return { outcome: "undeclared" };
  const declared = automationStudioConsequencesInOrder(patch.consequences);
  if (!declared.length) return { outcome: "permitted" };
  if (!gate) return { outcome: "required", sentence: "The fix needs a permission the run does not hold." };
  const verdict = await gate.checkFor({ kind: "flow_step", id: request.failedAttempt.definitionId, ref: request.failedAttempt.nodeId })({
    consequences: declared,
    control: { name: patch.kind === "temporary_target_override" ? "the step's new target" : "the fix's steps" },
    verb: patch.kind === "temporary_target_override" ? "press" : "run"
  });
  if (verdict.permitted) return { outcome: "permitted" };
  return { outcome: "required", sentence: gate.request?.sentence ?? "The fix needs a permission the run does not hold." };
}

/** Saves one fix's review record and adaptation, asks the promotion gate, and answers its receipt. */
async function recordFix(
  input: AutomationStudioInRunRepairBinding,
  base: JsonObject,
  prepared: Extract<AutomationStudioInRunRepairPreparation, { ok: true }>,
  purse: Purse
): Promise<JsonObject> {
  if (prepared.changeProposal) await input.ports.saveFlowChangeProposal(prepared.changeProposal);
  const saved = await input.ports.saveFlowAdaptation(prepared.adaptation);
  const promoted = await input.ports.promoteRuntimeAdaptation({ adaptation: saved, context: input.context });
  const approvalDecision = isJsonRecord(promoted.metadata?.approvalDecision) ? promoted.metadata.approvalDecision : undefined;
  return compactJsonObject({
    ...base,
    outcome: "overlaid",
    kind: prepared.patch.kind,
    changedUnit: prepared.overlay.changedUnit as unknown as JsonObject,
    adaptationId: promoted.adaptationId,
    changeProposalId: prepared.changeProposal?.proposalId,
    approvalDecision,
    // The executor takes the unit again itself; the detached retry never does on this fix's account.
    retryOriginalAction: false,
    ...spent(purse, input.runId)
  });
}

/** What one recovery recorded, kept for the run detail: everything a recovery after the run would have put there. */
function recoveryRecord(recovered: AutomationStudioFlowRunDetail): ReturnType<AutomationStudioInRunRepairLedger["recoveries"]>[number] {
  const metadata = recovered.metadata ?? {};
  return {
    interventions: recovered.interventions,
    adaptationIds: [...recovered.adaptationIds],
    changeProposalIds: [...recovered.changeProposalIds],
    metadata: compactJsonObject({
      llmGate: metadata.llmGate,
      recoveryTrace: metadata.recoveryTrace,
      permissionRequest: metadata.permissionRequest,
      runtimePatchAttempts: metadata.runtimePatchAttempts
    })
  };
}

/** Why the recovery left no fix, read from its own gate: the code a reader matches and the sentence a person reads. */
function noFix(recovered: AutomationStudioFlowRunDetail): Refusal {
  const gate = isJsonRecord(recovered.metadata?.llmGate) ? recovered.metadata.llmGate : {};
  const code = text(gate.patchHeldCode) ?? text(gate.patchSkippedCode) ?? text(gate.code) ?? (gate.patchDeclined !== undefined ? "model_declined" : "no_fix");
  if (gate.patchDeclined !== undefined) return { code, reason: "The model was asked for a fix to the failing step and declined." };
  return { code, reason: text(gate.patchSkipped) ?? text(gate.reason) ?? "The recovery found no fix for the failing step." };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** The part's graph as this run runs it: a fix of this run first, else the frame's own when it is the part, else the saved graph. Absent only when the Flow keeps no such graph; a read that fails throws. */
async function partGraphFor(input: AutomationStudioInRunRepairBinding, ledger: AutomationStudioInRunRepairLedger, request: AutomationStudioIncidentRepairRequest, subflowId: string): Promise<AutomationStudioFlowDocument | undefined> {
  const kept = ledger.partGraph(subflowId);
  if (kept) return kept;
  if (request.subflowId === subflowId) return request.graph;
  const saved = await input.ports.subflowGraphForRecovery?.(input.context.projectId, input.context.flowId, subflowId);
  // The interface stays with the graph: it is the part's contract.
  return saved ? { ...canonicalFlowDocument(saved), interface: saved.interface } as AutomationStudioFlowDocument : undefined;
}

/** The run so far as a run detail, which the recovery reads as it reads a run that ended. Statuses and ids only reach the model. */
function runSoFar(input: AutomationStudioInRunRepairBinding, request: AutomationStudioIncidentRepairRequest): AutomationStudioFlowRunDetail {
  const startedAt = request.attempts[0]?.startedAt ?? request.failedAttempt.startedAt;
  const session: AutomationStudioRuntimeSession = {
    schemaVersion: "0.1",
    runId: input.runId,
    projectId: input.context.projectId,
    targetKind: "flow",
    targetId: input.context.flowId,
    flowId: input.context.flowId,
    status: "failed",
    queuedAt: startedAt,
    startedAt,
    flow: request.graph,
    trace: { status: "failed", startedAt, currentNodeId: request.failedAttempt.nodeId, attempts: [...request.attempts], values: {}, effects: [] }
  };
  return runtimeSessionToFlowRunDetail(session, input.context.projectId);
}

/** What the run's in-run repairs have spent so far, for the receipt. */
function spent(purse: Purse, runId: string): JsonObject {
  if (!purse.current) return {};
  const snapshot = purse.current.ledger.snapshot(runId);
  return { spent: { calls: snapshot.calls, estimatedCostUsd: snapshot.estimatedCostUsd, ceilingUsd: purse.current.budget.ledger.maxEstimatedCostUsdPerRun } };
}

function repairUnit(unit: AutomationStudioRuntimePatchUnit): AutomationStudioRepairUnit {
  if (unit.kind === "handler") return { kind: "handler", handlerNodeId: unit.nodeId };
  return unit;
}

function sameUnit(left: AutomationStudioRepairUnit, right: AutomationStudioRepairUnit): boolean {
  if (left.kind === "node" && right.kind === "node") return left.nodeId === right.nodeId;
  if (left.kind === "handler" && right.kind === "handler") return left.handlerNodeId === right.handlerNodeId;
  return left.kind === "part" && right.kind === "part" && left.subflowId === right.subflowId;
}

function describeKind(kind: string): string {
  return kind.replace(/^temporary_/u, "").replace(/_/gu, " ");
}
