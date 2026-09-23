// Turning a generated plan's parameters into the ones its nodes run with,
// before the plan is validated.
//
// Flow Bootstrap calls this between parsing the model's plan and validating it
// against the registry, so validation -- and everything after it -- sees real
// parameters or nothing. It asks the bound domain about every node, one at a
// time, and trusts none of the answer: it must be one of the three the binding
// declares, resolved parameters must be plain bounded JSON, and whatever the
// node ends up with must name no handle. Anything else refuses the node.
//
// A refusal is an issue on the node, never a quiet fallback. A node that names
// a handle is refused when no resolver is bound, and when the generation made
// no exploration -- no handle can have been issued to the model then, so none
// is worth asking about.
//
// `assertAutomationStudioFlowBootstrapPlanHandlesResolved` is the same promise
// for a plan that did not come through generation -- one handed to
// `createFlowBootstrapAdaptation` directly, or read back to be applied.
//
// This is also where a step meets the permission gate. Core hands the domain a
// check with every node and, with it, what the step declared its own action
// would lastingly do (`./plan-step-consequences.ts`). The domain adds what only
// it knows -- which control, and the verb -- and calls the check. A step the
// run is not permitted comes back `needs_permission`: an issue of its own, not
// one of the model's mistakes, because no rewrite of the plan can answer it.
// Only a person can, and the gate has already raised the request that asks.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioActionPermissionDenied, type AutomationStudioActionPermissionCheck } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "./binding.ts";
import { automationStudioPlanNodeHandleSites, automationStudioPlanNodeParametersNameHandle } from "./plan-node-handles.ts";
import { automationStudioPlanStepConsequences } from "./plan-step-consequences.ts";

type ParameterResolver = Pick<AutomationStudioLlmEvidenceRuntimeBinding, "resolvePlanNodeParameters">;

/** Core's own reasons a node's parameters were not accepted. A domain's refusal carries the domain's codes instead. */
export const AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES = Object.freeze({
  malformed: "bootstrap.handle_malformed",
  notIssued: "bootstrap.handle_not_issued",
  unsupported: "bootstrap.handle_resolution_unavailable",
  failed: "bootstrap.parameter_resolution_failed",
  invalid: "bootstrap.parameter_resolution_invalid",
  refused: "bootstrap.parameters_refused",
  unresolved: "bootstrap.handle_unresolved",
  /** The step declared consequences Core could not read as its own classes. */
  consequences: "bootstrap.step_consequences_invalid",
  /** The step would do something lasting that neither the instruction nor the grant allows. */
  permission: "bootstrap.step_permission_required"
} as const);

const ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;
const MAX_REFUSAL_CODES = 16;
const MAX_RESOLVED_PARAMETER_BYTES = 16_384;

export type AutomationStudioFlowBootstrapPlanParameterResolution =
  | { ok: true; plan: AutomationStudioFlowBootstrapPlan; resolvedNodeKeys: string[] }
  | { ok: false; issues: AutomationStudioFlowBootstrapIssue[] };

/**
 * Resolve every node's parameters through the bound domain.
 *
 * Returns a new plan; the one passed in is not changed.
 */
export async function resolveAutomationStudioFlowBootstrapPlanParameters(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  projectId: string;
  flowId: string;
  binding?: ParameterResolver | undefined;
  /** Whether this generation explored, so the model can have been shown handles at all. */
  handlesIssued: boolean;
  /**
   * The build's permission check for one step, named by its definition and
   * `<subflow key>.<node key>`. Absent, every step is handed
   * `automationStudioActionPermissionDenied`: a plan resolved with no build
   * behind it has nobody to ask, so no step with a lasting consequence passes.
   */
  permissionFor?: ((step: { definitionId: string; ref: string }) => AutomationStudioActionPermissionCheck) | undefined;
}): Promise<AutomationStudioFlowBootstrapPlanParameterResolution> {
  const plan = structuredClone(input.plan);
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const resolvedNodeKeys: string[] = [];
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      const permission = input.permissionFor?.({ definitionId: node.definitionId, ref: `${subflow.key}.${node.key}` }) ?? automationStudioActionPermissionDenied;
      const outcome = await resolveNode(node, input, permission);
      const path = `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters`;
      if (outcome.status === "needs_permission") {
        // Not the model's mistake and not the model's to correct: the gate has
        // raised the request, and the person answers it. Nothing after it is
        // asked about, because the gate keeps only the first request and every
        // later step would be answered with an id that asks for another step's
        // classes -- a record that reads as though one request covered them all.
        issues.push(permissionIssue(outcome, path));
        return { ok: false, issues };
      }
      if (outcome.status === "refused") {
        for (const code of outcome.issueCodes) issues.push(parameterIssue(code, path));
        continue;
      }
      if (outcome.status === "unchanged") continue;
      node.parameters = outcome.parameters;
      resolvedNodeKeys.push(node.key);
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, plan, resolvedNodeKeys };
}

/**
 * Refuse a plan that still names a handle anywhere. For plans that reach
 * persistence or apply without passing through resolution.
 */
export function assertAutomationStudioFlowBootstrapPlanHandlesResolved(plan: AutomationStudioFlowBootstrapPlan): void {
  const paths = plan.subflows.flatMap((subflow, subflowIndex) => subflow.nodes.flatMap((node, nodeIndex) =>
    automationStudioPlanNodeParametersNameHandle(node.parameters)
      ? [`plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters (${AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unresolved})`]
      : []));
  if (paths.length) throw new Error(`Invalid Automation Studio Flow Bootstrap plan: ${paths.join(", ")}`);
}

type NodeOutcome =
  | { status: "unchanged" }
  | { status: "resolved"; parameters: JsonObject }
  | { status: "refused"; issueCodes: string[] }
  | { status: "needs_permission"; missing: string[]; requestId: string | null };

async function resolveNode(
  node: AutomationStudioFlowBootstrapNode,
  input: { projectId: string; flowId: string; binding?: ParameterResolver | undefined; handlesIssued: boolean },
  permission: AutomationStudioActionPermissionCheck
): Promise<NodeOutcome> {
  // The declaration comes off first, so nothing downstream -- the handle
  // search, the domain, the registry -- ever sees a parameter no node declares.
  const step = automationStudioPlanStepConsequences(node);
  if (step.malformed) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.consequences);
  const parameters = step.parameters;
  const found = automationStudioPlanNodeHandleSites(parameters);
  if (found.malformed) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.malformed);
  const namesHandle = found.sites.length > 0;
  if (namesHandle && !input.handlesIssued) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.notIssued);
  const resolver = input.binding?.resolvePlanNodeParameters;
  if (typeof resolver !== "function") {
    if (namesHandle) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unsupported);
    // No domain to ask, so a step that says it would do something lasting is
    // one nobody can permit; one that declared nothing lasting stands.
    if (step.declared?.length) return { status: "needs_permission", missing: [...step.declared], requestId: null };
    return stripped(step, parameters);
  }
  let answer: unknown;
  try {
    answer = await resolver.call(input.binding, {
      projectId: input.projectId,
      flowId: input.flowId,
      nodeDefinitionId: node.definitionId,
      parameters: structuredClone(parameters),
      permission,
      ...(step.declared ? { declaredConsequences: [...step.declared] } : {})
    });
  } catch {
    return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.failed);
  }
  if (!isRecord(answer)) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.invalid);
  if (answer.status === "refused" && exactKeys(answer, ["status", "issueCodes"]) && Array.isArray(answer.issueCodes)) {
    const codes = [...new Set(answer.issueCodes.filter((code): code is string => typeof code === "string" && ISSUE_CODE.test(code)))].slice(0, MAX_REFUSAL_CODES);
    return codes.length ? { status: "refused", issueCodes: codes } : refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.refused);
  }
  if (answer.status === "needs_permission" && exactKeys(answer, ["status", "missing", "requestId"])) {
    const missing = Array.isArray(answer.missing) ? answer.missing.filter((code): code is string => typeof code === "string" && ISSUE_CODE.test(code)).slice(0, MAX_REFUSAL_CODES) : [];
    const requestId = typeof answer.requestId === "string" && ISSUE_CODE.test(answer.requestId) ? answer.requestId : null;
    // A domain that says "not permitted" and names nothing has not said which
    // classes a person would have to grant, which is the whole of the answer.
    return missing.length ? { status: "needs_permission", missing, requestId } : refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.refused);
  }
  let outcome: NodeOutcome;
  if (answer.status === "unchanged" && exactKeys(answer, ["status"])) outcome = stripped(step, parameters);
  else if (answer.status === "resolved" && exactKeys(answer, ["status", "parameters"]) && isBoundedJsonObject(answer.parameters)) {
    outcome = { status: "resolved", parameters: structuredClone(answer.parameters) };
  } else return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.invalid);
  // Whatever the node leaves with -- its own parameters or the domain's --
  // names no handle.
  const leaving = outcome.status === "resolved" ? outcome.parameters : parameters;
  if (automationStudioPlanNodeParametersNameHandle(leaving)) return refused(AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.unresolved);
  return outcome;
}

/**
 * A node the domain left as written. Its parameters are still rewritten when
 * the step declared its consequences, because the declaration rode on them and
 * a node that kept it would be refused by the registry for a parameter no node
 * has.
 */
function stripped(step: { rodeOnParameters: boolean }, parameters: JsonObject): NodeOutcome {
  return step.rodeOnParameters ? { status: "resolved", parameters } : { status: "unchanged" };
}

function refused(issueCode: string): NodeOutcome {
  return { status: "refused", issueCodes: [issueCode] };
}

function parameterIssue(code: string, path: string): AutomationStudioFlowBootstrapIssue {
  return { severity: "error", code, message: "A node's parameters were not accepted by the domain that runs it.", path };
}

/**
 * A step nobody permitted. The classes and the request id are Core's own, so
 * the message says which grant would answer it without carrying anything out
 * of the domain.
 */
function permissionIssue(outcome: { missing: string[]; requestId: string | null }, path: string): AutomationStudioFlowBootstrapIssue {
  const asked = outcome.requestId === null ? "nobody was there to ask" : `request ${outcome.requestId} asks for them`;
  return {
    severity: "error",
    code: AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES.permission,
    message: `A step would do something lasting the run is not permitted (${outcome.missing.join(", ")}); ${asked}.`,
    path
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** Plain JSON, no deeper or wider than a plan parameter may be, and small. */
function isBoundedJsonObject(value: unknown): value is JsonObject {
  if (!isRecord(value) || !isPlainJson(value)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_RESOLVED_PARAMETER_BYTES;
  } catch {
    return false;
  }
}

function isPlainJson(value: unknown, seen = new Set<object>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value) || depth > 12) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 256 && value.every((item) => isPlainJson(item, seen, depth + 1));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 256 && entries.every(([key, item]) => key.length <= 200 && isPlainJson(item, seen, depth + 1));
}
