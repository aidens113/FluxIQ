import type { JsonObject } from "../../../../../core/index.ts";
import {
  automationStudioProjectStructurePlan,
  automationStudioProjectTaskSpec,
  type AutomationStudioProjectInstructionSource,
  type AutomationStudioProjectStructurePlan,
  type AutomationStudioProjectTaskSpec
} from "../contracts/index.ts";

/** One thing that stops a plan being written, by the path of what the model sent. */
export type AutomationStudioProjectSupervisorInputIssue = { code: string; path: string };

/**
 * Reads what `project.write_plan` and `project.amend_plan` were sent into a
 * task spec and a structure plan, each with the digest Core computes for it:
 * the model never writes a digest. What the plan reader insists on that says
 * nothing -- the schema version, a body's empty `nodes` and `edges` -- is filled
 * in when left out; everything else is read exactly as sent, and every issue
 * is answered, not only the first: the spec's shape, each part's words against
 * the instruction they name, the plan's shape, its binding to the spec, the
 * cover of every part and the router's own checks.
 */
export function automationStudioProjectSupervisorPlanInput(value: JsonObject, sources: readonly AutomationStudioProjectInstructionSource[]):
  | { ok: true; taskSpec: AutomationStudioProjectTaskSpec; structure: AutomationStudioProjectStructurePlan; purposes: Record<string, string> }
  | { ok: false; issues: AutomationStudioProjectSupervisorInputIssue[] } {
  const rawSpec = isObject(value.taskSpec) ? value.taskSpec : {};
  const specFields = { parts: rawSpec.parts, notAsked: rawSpec.notAsked ?? [] };
  const spec = automationStudioProjectTaskSpec.parse({ ...rawSpec, notAsked: specFields.notAsked, digest: automationStudioProjectTaskSpec.digest(specFields as Omit<AutomationStudioProjectTaskSpec, "digest">) });
  if (spec.status === "invalid") return { ok: false, issues: [{ code: spec.code, path: spec.path }] };
  const issues: AutomationStudioProjectSupervisorInputIssue[] = automationStudioProjectTaskSpec.quoteIssues(spec.value, sources);
  const rawStructure = isObject(value.structurePlan) ? value.structurePlan : {};
  const plan = withDefaults(rawStructure.plan);
  const structureFields = { taskSpecDigest: spec.value.digest, plan, partOf: rawStructure.partOf };
  const structure = automationStudioProjectStructurePlan.parse({ ...structureFields, digest: automationStudioProjectStructurePlan.digest(structureFields as Omit<AutomationStudioProjectStructurePlan, "digest">) });
  if (structure.status === "invalid") return { ok: false, issues: [...issues, { code: structure.code, path: structure.path }] };
  issues.push(...automationStudioProjectStructurePlan.issues(structure.value, spec.value));
  if (issues.length) return { ok: false, issues };
  return { ok: true, taskSpec: spec.value, structure: structure.value, purposes: purposesOf(value.purposes, structure.value) };
}

/** The plan as sent, with its schema version and each subflow's empty body filled in where left out. */
function withDefaults(value: unknown): unknown {
  if (!isObject(value)) return value;
  const plan: JsonObject = { ...value, schemaVersion: value.schemaVersion ?? "0.1" };
  if (Array.isArray(value.subflows)) {
    plan.subflows = value.subflows.map((subflow) => (isObject(subflow) ? { ...subflow, nodes: subflow.nodes ?? [], edges: subflow.edges ?? [] } : subflow));
  }
  return plan;
}

/** The one-line purposes the model gave for the plan's own subflows; anything else is not kept. */
function purposesOf(value: unknown, structure: AutomationStudioProjectStructurePlan): Record<string, string> {
  if (!isObject(value)) return {};
  const keys = new Set(structure.plan.subflows.map((subflow) => subflow.key));
  const purposes: Record<string, string> = {};
  for (const [key, purpose] of Object.entries(value)) {
    if (keys.has(key) && typeof purpose === "string" && purpose.trim()) purposes[key] = purpose.trim().slice(0, 500);
  }
  return purposes;
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
