// The run session's side of learning a layer the client's defence closed
// while a step succeeded (t516): the `learnInterruption` callback the executor
// calls (`../../executor/step-loop/incident-repair.ts`).
//
// No model is asked. The handler is Core's own (`./interruption-handler.ts`),
// and its one step names the pressed way out by the handle the domain gives
// it (`clearedControlHandles`, t470), resolved by the domain exactly as a
// build's step naming a handle is, from the views this Flow's runs took
// (`view_history`): a handle means nothing to a later run, so what is overlaid
// and saved is the domain's resolution or nothing.
//
// From there it is an in-run repair's path, unchanged: the same preflight and
// overlay (`prepareAutomationStudioInRunRepair`), the same review record,
// adaptation and promotion gate (`./in-run-repair-fix-record.ts`), the same
// receipt and kept overlay on the run's ledger. The adaptation waits for the
// run's judged end like any held fix (`../runtime-adaptation/judged-promotion.ts`):
// the executor lists the handler among the run's kept repairs, so a run judged
// to answer applies it to the saved Flow.
//
// What the run detail carries, so a reader -- the Lab's gate among them -- can
// tell the interruption was detected, repaired and kept: a `diagnosis`
// intervention saying the defence closed the layer, a `runtime_patch`
// intervention for the handler that passed its preflight, both marked
// deterministic and naming no provider, the patch attempt, and the adaptation.

import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowIntervention } from "../../../model/index.ts";
import { automationStudioActionPermissionDenied } from "../../action-permissions/index.ts";
import type { AutomationStudioIncidentRepair, AutomationStudioInterruptionLearningRequest } from "../../executor/lifecycle-run/index.ts";
import { prepareAutomationStudioInRunRepair } from "../../live-patch.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import { resolveAutomationStudioFlowBootstrapPlanParameters, type AutomationStudioRuntimeAddHandlerPatch } from "../../llm/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import type { AutomationStudioInRunRepairBinding } from "./in-run-repair.ts";
import { recordAutomationStudioInRunFix } from "./in-run-repair-fix-record.ts";
import type { AutomationStudioInRunRepairLedger } from "./in-run-repair-ledger.ts";
import { automationStudioInterruptionHandlerPatch } from "./interruption-handler.ts";

/** What every record of a learned layer says it came from. */
const LEARNED_FROM = "defence_close";

/** Learns `request.layer` as a handler of the frame's graph, or answers why not (header). Never asks a model. */
export async function learnAutomationStudioInterruption(
  input: AutomationStudioInRunRepairBinding,
  ledger: AutomationStudioInRunRepairLedger,
  request: AutomationStudioInterruptionLearningRequest
): Promise<AutomationStudioIncidentRepair> {
  const { layer, attempt } = request;
  // One successful attempt can clear several layers; each fix needs its own
  // receipt and kept-overlay identity for the judged end.
  const repairId = `learn.${createHash("sha256").update(JSON.stringify([input.runId, request.framePath, attempt.attemptId, layer.wayOut])).digest("hex")}`;
  const base: JsonObject = compactJsonObject({ repairId, nodeId: attempt.nodeId, framePath: [...request.framePath], learnedFrom: LEARNED_FROM, layerKind: layer.kind });
  const refuse = (code: string, reason: string, issueCodes?: readonly string[]): AutomationStudioIncidentRepair => {
    ledger.record(compactJsonObject({ ...base, outcome: "none", code, reason, ...(issueCodes?.length ? { issueCodes: [...issueCodes] } : {}) }));
    return { kind: "none", reason };
  };
  const scope = { projectId: input.context.projectId, flowId: input.context.flowId };
  const handles = layer.wayOut === undefined ? {} : await input.ports.llmEvidenceRuntime?.clearedControlHandles?.({ ...scope, wayOuts: [layer.wayOut] }) ?? {};
  const handle = layer.wayOut === undefined ? undefined : handles[layer.wayOut];
  if (!handle) return refuse("way_out_unnamed", "The way out the run pressed could not be named on the page, so no step closing the layer was learned.");
  const proposed = automationStudioInterruptionHandlerPatch({ graph: request.graph, nodeId: attempt.nodeId, layer, handle });
  if (!proposed) return refuse("already_handled", "The step already has a handler for this layer, or the layer cannot be waited for by its name.");
  const resolved = await resolvePress(input, proposed);
  if (!resolved.ok) return refuse("step_unresolved", "The step closing the layer could not be tied to the control the run pressed, so it was not learned.", resolved.issueCodes);
  const prepared = prepareAutomationStudioInRunRepair({
    ...scope,
    ...(request.subflowId ? { subflowId: request.subflowId } : {}),
    runId: input.runId,
    flow: request.graph,
    patch: resolved.patch,
    failedAttempt: attempt,
    policy: input.context.policy,
    proposalMode: input.context.policy.proposalMode,
    // The handler declares no lasting consequence, and the domain held its press to that when it resolved it, which is
    // the gate's answer an in-run repair's preflight reads (`./in-run-repair.ts`, `permissionFor`).
    sideEffectPermission: "permitted",
    options: input.graphOptions,
    ...(input.now ? { now: input.now } : {})
  });
  if (!prepared.ok) return refuse(prepared.code, `The learned handler could not be used: ${prepared.reason}`);
  let receipt: JsonObject;
  try {
    receipt = await recordAutomationStudioInRunFix({ ports: input.ports, context: input.context, base, prepared });
  } catch {
    // A fix that could not be recorded could never be saved, so it does not run either.
    return refuse("unrecorded", "The learned handler could not be recorded for review, so it was not used.");
  }
  ledger.record(receipt);
  ledger.recordRecovery(recoveryRecord(input, request, resolved.patch, receipt));
  ledger.keepOverlay({ repairId, framePath: [...request.framePath], graph: prepared.overlay.flow });
  const unit = prepared.overlay.changedUnit;
  return { kind: "overlay", repairId, unit: unit.kind === "handler" ? { kind: "handler", handlerNodeId: unit.nodeId } : unit, graph: prepared.overlay.flow, reason: resolved.patch.reason };
}

/** The handler with its one step's handle resolved by the domain, as a build's step is; or the domain's codes. */
async function resolvePress(
  input: AutomationStudioInRunRepairBinding,
  patch: AutomationStudioRuntimeAddHandlerPatch
): Promise<{ ok: true; patch: AutomationStudioRuntimeAddHandlerPatch } | { ok: false; issueCodes: string[] }> {
  const [step] = patch.steps;
  if (!step) return { ok: false, issueCodes: [] };
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1",
    router: { name: "learned", rules: [], fallback: { kind: "subflow", targetSubflowKey: "learned" } },
    subflows: [{ key: "learned", name: "learned", role: "recovery", nodes: [{ key: "close", definitionId: step.definitionId, definitionVersion: "1.0.0", parameters: step.parameters ?? {}, consequences: [] }], edges: [] }]
  };
  const result = await resolveAutomationStudioFlowBootstrapPlanParameters({
    plan,
    projectId: input.context.projectId,
    flowId: input.context.flowId,
    binding: input.ports.llmEvidenceRuntime,
    handlesIssued: true,
    // The handle was issued for a look at the page the layer was closed on, which this Flow's view history keeps (t470).
    handleReach: "view_history",
    // A step that declares no lasting consequence is permitted with nobody to ask; one the domain finds lasting is not.
    permissionFor: () => automationStudioActionPermissionDenied
  });
  if (!result.ok) return { ok: false, issueCodes: [...new Set(result.issues.map((issue) => issue.code))] };
  const parameters = result.plan.subflows[0]?.nodes[0]?.parameters;
  if (!parameters) return { ok: false, issueCodes: [] };
  return { ok: true, patch: { ...patch, steps: [{ ...step, parameters }] } };
}

/** What the run detail keeps of the learning, as an in-run recovery's record (header). */
function recoveryRecord(
  input: AutomationStudioInRunRepairBinding,
  request: AutomationStudioInterruptionLearningRequest,
  patch: AutomationStudioRuntimeAddHandlerPatch,
  receipt: JsonObject
): ReturnType<AutomationStudioInRunRepairLedger["recoveries"]>[number] {
  const createdAt = input.now?.() ?? Date.now();
  const adaptationId = typeof receipt.adaptationId === "string" ? receipt.adaptationId : undefined;
  const changeProposalId = typeof receipt.changeProposalId === "string" ? receipt.changeProposalId : undefined;
  const repairId = typeof receipt.repairId === "string" ? receipt.repairId : request.attempt.attemptId;
  const marks: JsonObject = { deterministic: true, learnedFrom: LEARNED_FROM, nodeId: request.attempt.nodeId, layerKind: request.layer.kind };
  const intervention = (kind: AutomationStudioFlowIntervention["kind"], suffix: string, reason: string, metadata: JsonObject): AutomationStudioFlowIntervention => ({
    schemaVersion: "0.1",
    interventionId: `intervention.${repairId}.${suffix}`,
    runId: input.runId,
    flowId: input.context.flowId,
    projectId: input.context.projectId,
    kind,
    reason,
    validation: { ok: true },
    createdAt,
    metadata
  });
  return {
    interventions: [
      intervention("diagnosis", "learned-diagnosis", `The run's defence closed a layer the page put in the way of ${request.attempt.nodeId}; the Flow had no step for it.`, marks),
      intervention("runtime_patch", "learned-handler", patch.reason, compactJsonObject({ ...marks, patchKind: patch.kind, adaptationId, changeProposalId }))
    ],
    adaptationIds: adaptationId ? [adaptationId] : [],
    changeProposalIds: changeProposalId ? [changeProposalId] : [],
    metadata: {
      runtimePatchAttempts: [compactJsonObject({ kind: patch.kind, inRun: true, preflightOk: true, adaptationId, changeProposalId, retryOriginalAction: false, traceStatus: "held", learnedFrom: LEARNED_FROM })]
    }
  };
}
