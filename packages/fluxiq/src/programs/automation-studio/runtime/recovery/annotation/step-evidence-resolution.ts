// The steps a repair writes, resolved by the domain as a build's steps are
// (t429).
//
// An in-run repair's `temporary_action_sequence`, `add_handler` and
// `replace_unit` carry steps -- a definition and its parameters -- and a
// handler's facts. The model names every control in them by the handle the
// evidence printed, `{ "handle": "t5" }` in a step and `{ "handles": { ... } }`
// in a fact's target, exactly as it names one in a build. Until now they were
// overlaid and saved as written: a handle means nothing on a later page, so a
// fix saved after its judged run held a control the Flow could never find
// again, and none of the identity a build's step is saved with (paid proof
// R4b's blocker, t425's open question 1).
//
// So each step and each fact target is put to the domain through the one seam
// a build's are (`resolveAutomationStudioFlowBootstrapPlanParameters`), before
// anything is overlaid: what comes back is what the domain saves for a built
// step, or a refusal. Core reads none of it. A step that names no handle is
// asked about too, as a build's is, so the domain sees every step a Flow will
// keep; with no domain to ask it stands, since the recovery's gate has already
// answered for what the fix said it would do.
//
// **One packet per step.** A domain numbers its handles per packet, and the
// repair's model was shown the failure packet and the packets its exploration
// returned, none of them a build's views. A step's handles are routed the way a
// target override's are (`./target-evidence-check.ts`): unqualified, the
// failure packet; all qualified with one explored packet's label, that packet,
// with Core's qualifier removed. A step that mixes packets, names an explored
// packet the request did not carry, or names a handle when no packet was shown
// at all is refused without asking anyone, so a handle is never saved raw.
//
// **A fact names one control.** A fact target's `handles` with more than one
// entry is not one control and is refused; one with one is resolved as the
// build resolves a fact's target (`AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID`),
// and the domain's answer becomes the fact's target.
//
// **Only by handle (t432; user, 2026-10-10).** The model names a control by the
// handle the evidence printed and nothing else, so every step and fact here is
// the model's own writing (`writtenByModel`): the domain refuses a step that
// names a control any other way -- an address or an identity of its own --
// rather than letting it stand as written, and a fact whose target is anything
// but `handles` is refused here, before anyone is asked.
//
// A refusal's sentence is for a person reading the run: it says which step and
// that its control could not be tied to the page, and never how a control is
// found. The domain's codes travel beside it for the record.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioActionPermissionDenied, type AutomationStudioActionPermissionCheck } from "../../action-permissions/index.ts";
import type { AutomationStudioFactCondition } from "../../executor/lifecycle/index.ts";
import type { AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import {
  AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID,
  AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES,
  automationStudioExploredEvidenceHandle,
  automationStudioPlanNodeHandleSites,
  resolveAutomationStudioFlowBootstrapPlanParameters,
  type AutomationStudioLlmContextPacket,
  type AutomationStudioRuntimePatch,
  type AutomationStudioRuntimePatchHandlerSpec,
  type AutomationStudioRuntimePatchStep
} from "../../llm/index.ts";
import { isJsonRecord } from "../../service/index.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "./ports.ts";

/** A patch with every step and fact target as the domain resolved it, or why not. */
export type AutomationStudioRecoveryStepResolution =
  | { ok: true; patch: AutomationStudioRuntimePatch }
  | { ok: false; code: "step_unresolved" | "permission_required"; reason: string; issueCodes: string[] };

type Refused = Extract<AutomationStudioRecoveryStepResolution, { ok: false }>;

/**
 * Core's own code for a handle no packet the request carried can have issued.
 * Read when used, never when this module loads: `../../llm/` and this module
 * import each other, and whichever loads first sees the other's exports still
 * undefined (two test entries failed to import on `.notIssued`).
 */
function notIssued(): typeof AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.notIssued {
  return AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.notIssued;
}

/**
 * The resolver a recovery's patches pass through before they are overlaid
 * (header). `permissionFor` is the check one step is put to, by its
 * definition: the recovery's gate, which has already answered for what the
 * whole fix declared.
 */
export function automationStudioRecoveryStepResolution(input: {
  ports: Pick<AutomationStudioRuntimeRecoveryPorts, "llmEvidenceRuntime">;
  projectId: string;
  flowId: string;
  failureEvidence?: JsonObject | undefined;
  explorationEvidence?: AutomationStudioLlmContextPacket["explorationEvidence"] | undefined;
  permissionFor(definitionId: string): AutomationStudioActionPermissionCheck;
}): (patch: AutomationStudioRuntimePatch) => Promise<AutomationStudioRecoveryStepResolution> {
  const carried = new Map((input.explorationEvidence?.packets ?? []).map((entry) => [entry.evidenceId, entry.packet] as const));
  const context: Context = { ...input, carried };
  return async (patch) => {
    if (patch.kind === "temporary_action_sequence") {
      const steps = await resolveSteps(context, patch.steps, patch.consequences, "");
      return "ok" in steps ? steps : { ok: true, patch: { ...patch, steps } };
    }
    if (patch.kind === "add_handler") {
      const handler = await resolveHandler(context, patch, patch.consequences);
      return "ok" in handler ? handler : { ok: true, patch: { ...patch, ...handler } };
    }
    if (patch.kind === "replace_unit") {
      const steps = patch.steps ? await resolveSteps(context, patch.steps, patch.consequences, "") : undefined;
      if (steps && "ok" in steps) return steps;
      const handler = patch.handler ? await resolveHandler(context, patch.handler, patch.consequences, "handler's ") : undefined;
      if (handler && "ok" in handler) return handler;
      return { ok: true, patch: { ...patch, ...(steps ? { steps } : {}), ...(handler ? { handler: { ...patch.handler!, ...handler } } : {}) } };
    }
    return { ok: true, patch };
  };
}

type Context = Parameters<typeof automationStudioRecoveryStepResolution>[0] & { carried: ReadonlyMap<string, JsonObject> };

/** A handler's steps and the targets of its facts, resolved. */
async function resolveHandler(
  context: Context,
  spec: AutomationStudioRuntimePatchHandlerSpec,
  consequences: readonly string[] | undefined,
  owner = ""
): Promise<Pick<AutomationStudioRuntimePatchHandlerSpec, "steps" | "when" | "completionCheck"> | Refused> {
  const when = await resolveFacts(context, spec.when, `${owner}situation`);
  if ("ok" in when) return when;
  const completionCheck = spec.completionCheck ? await resolveFacts(context, spec.completionCheck, `${owner}check`) : undefined;
  if (completionCheck && "ok" in completionCheck) return completionCheck;
  const steps = await resolveSteps(context, spec.steps, consequences, owner);
  if ("ok" in steps) return steps;
  return { steps, when, ...(completionCheck ? { completionCheck } : {}) };
}

/** Each step in order; the first refused refuses the fix. */
async function resolveSteps(
  context: Context,
  steps: readonly AutomationStudioRuntimePatchStep[],
  consequences: readonly string[] | undefined,
  owner: string
): Promise<AutomationStudioRuntimePatchStep[] | Refused> {
  const resolved: AutomationStudioRuntimePatchStep[] = [];
  for (const [index, step] of steps.entries()) {
    const where = `${owner}step ${index + 1}`;
    const routed = route(context, step.parameters ?? {});
    if ("refused" in routed) return unresolved(where, [routed.refused]);
    const node: AutomationStudioFlowBootstrapNode = {
      key: `step-${index + 1}`,
      definitionId: step.definitionId,
      definitionVersion: "1.0.0",
      parameters: routed.parameters,
      ...(consequences !== undefined ? { consequences: [...consequences] } : {})
    };
    const answer = await resolveOne(context, node, routed.packet, context.permissionFor(step.definitionId), routed.namesHandle);
    if ("ok" in answer) return answer.code === "permission_required" ? answer : unresolved(where, answer.issueCodes);
    resolved.push({ ...step, ...(answer.parameters !== undefined ? { parameters: answer.parameters } : {}) });
  }
  return resolved;
}

/** Each fact whose target names handles, resolved to the target the domain answers; one with no target as written; any other target refused (header). */
async function resolveFacts(context: Context, facts: readonly AutomationStudioFactCondition[], where: string): Promise<AutomationStudioFactCondition[] | Refused> {
  const resolved: AutomationStudioFactCondition[] = [];
  for (const fact of facts) {
    const target = fact.target as JsonValue | undefined;
    if (target === undefined) {
      resolved.push(fact);
      continue;
    }
    if (!isJsonRecord(target) || !isJsonRecord(target.handles)) return notAHandle(where);
    const handles = Object.values(target.handles);
    // A fact is about one control (header).
    if (handles.length !== 1 || typeof handles[0] !== "string") return unresolved(where, [AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.malformed]);
    const routed = route(context, { target: { handle: handles[0] } });
    if ("refused" in routed) return unresolved(where, [routed.refused]);
    const node: AutomationStudioFlowBootstrapNode = { key: "fact", definitionId: AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID, definitionVersion: "1.0.0", parameters: routed.parameters, consequences: [] };
    // A fact is read, never acted on: nothing to permit, as at bootstrap.
    const answer = await resolveOne(context, node, routed.packet, automationStudioActionPermissionDenied, true);
    if ("ok" in answer) return unresolved(where, answer.issueCodes);
    // The resolution refuses an `unchanged` answer for a node naming a handle, so this is the domain's.
    if (!answer.parameters) return unresolved(where, [AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unresolved]);
    resolved.push({ ...fact, target: answer.parameters });
  }
  return resolved;
}

/**
 * One node through the build's resolution, as a plan of one, handed the one
 * packet its handles came from. With no domain to ask, a node that names no
 * handle stands as written and one that names a handle is refused.
 */
async function resolveOne(
  context: Context,
  node: AutomationStudioFlowBootstrapNode,
  packet: JsonObject | undefined,
  permission: AutomationStudioActionPermissionCheck,
  namesHandle: boolean
): Promise<{ parameters: JsonObject | undefined } | Refused> {
  const binding = context.ports.llmEvidenceRuntime;
  if (typeof binding?.resolvePlanNodeParameters !== "function") {
    return namesHandle ? refusedWith("step_unresolved", [AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unsupported]) : { parameters: node.parameters };
  }
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1",
    router: { name: "repair", rules: [], fallback: { kind: "subflow", targetSubflowKey: "repair" } },
    subflows: [{ key: "repair", name: "repair", role: "recovery", nodes: [node], edges: [] }]
  };
  const result = await resolveAutomationStudioFlowBootstrapPlanParameters({
    plan,
    projectId: context.projectId,
    flowId: context.flowId,
    binding,
    // Handles were shown: the packet is how the domain finds them, and a step naming one with no packet was refused before here.
    handlesIssued: true,
    permissionFor: () => permission,
    ...(packet ? { handleEvidence: packet } : {}),
    // Every step and fact a repair carries is the model's own writing (header).
    writtenByModel: true
  });
  if (!result.ok) {
    const codes = [...new Set(result.issues.map((issue) => issue.code))];
    return refusedWith(codes.includes(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.permission) ? "permission_required" : "step_unresolved", codes);
  }
  return { parameters: result.plan.subflows[0]!.nodes[0]!.parameters };
}

/**
 * The one packet a value's handles came from, and the value with Core's
 * qualifier removed (header); or the code it is refused with. A value that
 * names no handle comes from no packet.
 */
function route(context: Context, parameters: JsonObject): { parameters: JsonObject; packet?: JsonObject; namesHandle: boolean } | { refused: string } {
  const found = automationStudioPlanNodeHandleSites(parameters);
  // A malformed reference is the resolution's to refuse, with its own code.
  if (found.malformed || found.sites.length === 0) return { parameters, namesHandle: found.malformed };
  const read = found.sites.map((site) => ({ site, handle: automationStudioExploredEvidenceHandle(site.handle) }));
  const labels = new Set(read.flatMap((entry) => (entry.handle.kind === "qualified" ? [entry.handle.evidenceId] : [])));
  if (labels.size === 0) return context.failureEvidence ? { parameters, packet: context.failureEvidence, namesHandle: true } : { refused: notIssued() };
  if (labels.size > 1 || read.some((entry) => entry.handle.kind !== "qualified")) return { refused: notIssued() };
  const packet = context.carried.get([...labels][0]!);
  if (!packet) return { refused: notIssued() };
  const unqualified = structuredClone(parameters);
  for (const entry of read) setHandle(unqualified, entry.site.path, entry.handle.handle);
  return { parameters: unqualified, packet, namesHandle: true };
}

/** Writes `handle` into the reference at `path`. */
function setHandle(parameters: JsonObject, path: ReadonlyArray<string | number>, handle: string): void {
  let at: unknown = parameters;
  for (const key of path) at = (at as Record<string | number, unknown>)[key];
  (at as Record<string, unknown>).handle = handle;
}

/** A fact naming its control by anything but a handle (header): Core's own code, no domain asked. */
function notAHandle(where: string): Refused {
  return unresolved(where, [AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.notAHandle]);
}

/** A code, Core's or a domain's (`<domain>.handle.not_a_handle:<position>`), saying a control was named by something other than a handle. */
const NOT_A_HANDLE_CODE = /(?:^|\.)(?:handle\.not_a_handle|target_not_a_handle)(?::|$)/u;

function unresolved(where: string, issueCodes: readonly string[]): Refused {
  const notByHandle = issueCodes.some((code) => NOT_A_HANDLE_CODE.test(code));
  return {
    ok: false,
    code: "step_unresolved",
    reason: notByHandle
      ? `The fix's ${where} names a control by something other than the handle the page view printed for it, so the fix was not used.`
      : `The fix's ${where} names a control that could not be tied to the page the model was shown, so the fix was not used.`,
    issueCodes: [...issueCodes]
  };
}

function refusedWith(code: Refused["code"], issueCodes: readonly string[]): Refused {
  if (code === "permission_required") return { ok: false, code, reason: "The fix needs a permission the run does not hold.", issueCodes: [...issueCodes] };
  return { ok: false, code, reason: "", issueCodes: [...issueCodes] };
}
