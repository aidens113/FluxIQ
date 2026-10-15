// What `project.write_plan` and `project.amend_plan` read: a task spec and the
// supervisor's planning format, compiled by Core into the structure plan.
//
// **Why the planning format (t569).** The supervisor used to be asked for
// Core's raw `AutomationStudioFlowBootstrapPlan` -- router rules, interface ports
// `{id, name, valueType}`, structured success checks -- and guessed:
// `run-mv7t19hg-1d51f430` (bigbox, steps 0025-0034) wrote an excellent task spec
// and had every one of five plans refused (`structurePlan.plan.router` missing,
// `subflows` an object, `subflows.0.kind`, then `subflows.0.callable` twice).
// What it knows is which parts belong together, what values pass between them
// and what has to run first; the rest is Core's to write. So it writes
//
//   subflows: [{ key, name, purpose, parts: [partId], inputs: [name], outputs: [name], after: [key] }]
//
// and nothing else, and Core builds the structure plan from it:
//
// - One subflow with no inputs and no outputs is the router-run subflow
//   itself, carrying its parts.
// - Otherwise every subflow written is a callable part with an interface built
//   from its names (each port `{ id: name, name, valueType: unknown }`), and
//   Core adds the router-run subflow, keyed `main` unless that key is taken,
//   carrying no part: assembly writes its calls (`./assembly.ts`).
// - `partOf` is each subflow's `parts`; `after` is kept beside the plan as each
//   brief's predecessors when the brief names none (`./brief-input.ts`).
// - No success check: proposing how a subflow shows it is done is its
//   builder's work, not the supervisor's.
//
// **What a plan hands on, and what it is for (bigbox debug fix 7).** Bigbox
// `run-mv8186yr-a385fd3a` planned a value no step of the subflows taking it
// read, and a fourth subflow for a part that only said what must stay as it
// was; the value made its producer's builder bind an output it had no step for,
// and the extra subflow made a builder with nothing to build, which then acted
// unbriefed. The guidance says when a value is one (a later step uses it) and
// when a part is a constraint, and the written plan's answer carries two
// warnings beside it (`warnings`, each by its path):
//
// - A value no other subflow takes, `project.plan_value_unused`. A warning,
//   not a refusal: it may be what the Flow hands back to the person (a value
//   read for them), and nothing in the plan says which, so only the model can
//   tell; the answer says to drop it with `project.amend_plan` unless it is
//   the Flow's result. (Bigbox's value was taken by name by the later
//   subflows and read by none of their steps: a plan cannot show that, so
//   there the guidance is what answers it.)
// - In a plan of several subflows, a subflow none of whose parts has a lasting
//   act and that hands nothing on is a warning, `project.plan_subflow_constraint`:
//   it may be a read the person asked for (its rows are the run's dataset),
//   which a refusal would forbid, or a part whose facts only say what must stay
//   unchanged -- a constraint for `notAsked` and the judge's checklist, with no
//   subflow of its own. Core cannot read which from the words, so the answer
//   names both and the model amends the plan.
//
// **Shaping a read belongs to that read (everything-store debug, t630).** A8
// wave 7 `run-mv9dd0fk-8cd2e522` planned a second subflow that took the rows
// the first read and only dropped repeats, kept their order and chose their
// columns. That is the read's own condition and processing: its builder had no
// page work of its own, re-read the page, was refused for never reading its
// input, and the build spent most of its money on the split. So a subflow of
// several that takes a value another subflow hands on, carries no part with a
// lasting act, and hands on nothing another subflow takes is a warning,
// `project.plan_subflow_reshape_only`: a warning because a builder that opens
// or reads something on the target for each row is a legitimate such subflow,
// and only the model can tell which. And the output of the subflow that runs
// last -- the one nothing runs after, that itself runs after another, or the
// only one -- is what the Flow hands back, so it is never `plan_value_unused`:
// that warning told the same run to remove the Flow's answer, twice.
//
// **Core's router entry sent back is left out (bigbox debug, t595).** Bigbox
// `run-mv8c7unr-42a8456d` amended its plan by copying the written plan's
// answer, which listed the router-run subflow Core had added, `main` with
// `parts: []`, and was refused `project.plan_subflow_no_parts`. That entry is
// Core's own, not a subflow the model meant to write, so in a plan of several
// an entry keyed as Core keys its router subflow (`main` or `main_<n>`) with
// no parts, inputs or outputs is left out, as is its key from every `after`;
// Core adds the router subflow again, so the plan is the one the model meant.
// Every issue still names the path of what was sent.
//
// **An amendment never drops the person's request (A8 frozen pair 3 bigbox,
// t645).** `run-mv9zn5ob-d929084d` amended its plan so that no part quoted the
// person's first request and `notAsked` listed it, Core accepted it, and the
// build could only end on a false reason. An amendment is read against the
// plan in force (`current`): a stretch of the person's words its parts no
// longer quote, or a `notAsked` item it adds that restates a part, is refused
// `project.plan_part_dropped`, each issue naming the part and the words
// (`../contracts/task-spec.ts`, `droppedIssues`). Not a hint the model may
// override: a part is given up only by ending honestly.
//
// The raw plan is out of the model's reach: a `structurePlan` sent is refused
// as a field the format does not have. Every refusal names the planning
// format's own path -- `subflows.1.inputs.0`, never `structurePlan.plan...` --
// and every issue is answered, not only the first.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapInterfacePort, AutomationStudioFlowBootstrapPlan, AutomationStudioFlowBootstrapSubflow } from "../../flow-bootstrap/plan/index.ts";
import {
  automationStudioProjectJsonShape as shape,
  automationStudioProjectStructurePlan,
  automationStudioProjectTaskSpec,
  type AutomationStudioProjectInstructionSource,
  type AutomationStudioProjectStructurePlan,
  type AutomationStudioProjectTaskSpec
} from "../contracts/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_GUIDANCE as GUIDANCE } from "./guidance.ts";

/**
 * One thing that stops a plan being written, by the path of what the model sent; a dropped part names the part of the
 * plan in force and the words dropped (header, t645).
 */
export type AutomationStudioProjectSupervisorInputIssue = { code: string; path: string; part?: string; dropped?: string };

/** A subflow as the supervisor writes it, and its index in what was sent (`at`), which every issue's path names. */
type Written = { at: number; key: string; name: string; purpose?: string; parts: string[]; inputs: string[]; outputs: string[]; after: string[] };

/** A subflow's key, as the bootstrap plan's reader takes one (`../../flow-bootstrap/plan/issues.ts`, `symbolic`). */
const SUBFLOW_KEY = /^[a-z][a-z0-9_-]{0,63}$/u;
/** The keys Core gives the router-run subflow it adds (`routerKey`). */
const ROUTER_KEY = /^main(?:_[0-9]+)?$/u;
/** An interface port's name, as the bootstrap plan's reader takes one (`../../flow-bootstrap/plan/parsing.ts`, `PORT_NAME`). */
const PORT_NAME = /^[a-z][A-Za-z0-9]{0,31}$/u;
/** The structure plan holds 40 subflows; Core may add one. */
const MAX_SUBFLOWS = 39;
const MAX_PORTS = 40;
const MAX_PARTS = 50;

/** `current` is the task spec of the plan in force, given for an amendment, which may not drop its words (header, t645). */
export function automationStudioProjectSupervisorPlanInput(value: JsonObject, sources: readonly AutomationStudioProjectInstructionSource[], current?: AutomationStudioProjectTaskSpec):
  | { ok: true; taskSpec: AutomationStudioProjectTaskSpec; structure: AutomationStudioProjectStructurePlan; purposes: Record<string, string>; after: Record<string, string[]>; warnings: AutomationStudioProjectSupervisorInputIssue[] }
  | { ok: false; issues: AutomationStudioProjectSupervisorInputIssue[] } {
  const issues: AutomationStudioProjectSupervisorInputIssue[] = Object.keys(value)
    .filter((key) => key !== "taskSpec" && key !== "subflows" && key !== "reason")
    .map((key) => ({ code: "project.unknown_field", path: key }));
  const rawSpec = isObject(value.taskSpec) ? value.taskSpec : {};
  const specFields = { parts: rawSpec.parts, notAsked: rawSpec.notAsked ?? [] };
  const spec = automationStudioProjectTaskSpec.parse({ ...rawSpec, notAsked: specFields.notAsked, digest: automationStudioProjectTaskSpec.digest(specFields as Omit<AutomationStudioProjectTaskSpec, "digest">) });
  if (spec.status === "invalid") issues.push({ code: spec.code, path: spec.path });
  else issues.push(...automationStudioProjectTaskSpec.quoteIssues(spec.value, sources), ...(current ? automationStudioProjectTaskSpec.droppedIssues(current, spec.value, sources) : []));
  const written = readSubflows(value.subflows, issues);
  if (spec.status === "invalid" || !written || issues.length) return { ok: false, issues };
  const compiled = compile(written);
  const structureFields = { taskSpecDigest: spec.value.digest, plan: compiled.plan, partOf: compiled.partOf };
  const structure = automationStudioProjectStructurePlan.parse({ ...structureFields, digest: automationStudioProjectStructurePlan.digest(structureFields) });
  // Core wrote this plan, so a refusal of it is Core's; it is still answered, by the path Core's reader gave.
  if (structure.status === "invalid") return { ok: false, issues: [{ code: structure.code, path: structure.path }] };
  const index = new Map(written.map((subflow) => [subflow.key, subflow.at]));
  for (const issue of automationStudioProjectStructurePlan.issues(structure.value, spec.value)) {
    const part = /^structurePlan\.partOf\.([^.]+)\.(\d+)$/u.exec(issue.path);
    const at = part ? index.get(part[1]!) : undefined;
    issues.push(at === undefined ? issue : { code: issue.code, path: `subflows.${at}.parts.${part![2]}` });
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, taskSpec: spec.value, structure: structure.value, purposes: compiled.purposes, after: Object.fromEntries(written.map((subflow) => [subflow.key, [...subflow.after]])), warnings: valueWarnings(written, spec.value) };
}

/**
 * Each value no other subflow takes, other than what the last subflow hands back; each subflow of
 * several that neither acts nor hands anything on; and each that only reshapes what another reads (header).
 */
function valueWarnings(written: readonly Written[], spec: AutomationStudioProjectTaskSpec): AutomationStudioProjectSupervisorInputIssue[] {
  const warned: AutomationStudioProjectSupervisorInputIssue[] = [];
  for (const subflow of written) {
    if (handsBackTheAnswer(subflow, written)) continue;
    for (const [index, output] of subflow.outputs.entries()) {
      if (!takenByAnother(subflow, output, written)) warned.push({ code: "project.plan_value_unused", path: `subflows.${subflow.at}.outputs.${index}` });
    }
  }
  if (written.length < 2) return warned;
  const acts = new Map(spec.parts.map((part) => [part.id, part.lastingActs.length > 0]));
  for (const subflow of written) {
    if (subflow.parts.some((part) => acts.get(part))) continue;
    if (!subflow.outputs.length) warned.push({ code: "project.plan_subflow_constraint", path: `subflows.${subflow.at}` });
    else if (takesFromAnother(subflow, written) && subflow.outputs.every((output) => !takenByAnother(subflow, output, written))) {
      warned.push({ code: "project.plan_subflow_reshape_only", path: `subflows.${subflow.at}` });
    }
  }
  return warned;
}

/** Whether a subflow other than `subflow` takes `value`. */
function takenByAnother(subflow: Written, value: string, written: readonly Written[]): boolean {
  return written.some((other) => other !== subflow && other.inputs.includes(value));
}

/** Whether `subflow` takes a value another subflow hands on. */
function takesFromAnother(subflow: Written, written: readonly Written[]): boolean {
  return subflow.inputs.some((input) => written.some((other) => other !== subflow && other.outputs.includes(input)));
}

/**
 * Whether `subflow` runs last, so what it hands on is the Flow's answer (header): the only subflow, or one that runs
 * after another (by after, or by taking its value) while nothing runs after it or takes what it hands on.
 */
function handsBackTheAnswer(subflow: Written, written: readonly Written[]): boolean {
  if (written.length === 1) return true;
  const followed = written.some((other) => other !== subflow && (other.after.includes(subflow.key) || other.inputs.some((input) => subflow.outputs.includes(input))));
  return !followed && (subflow.after.length > 0 || takesFromAnother(subflow, written));
}

/** Every subflow as written, each issue by its path; undefined when any was refused. */
function readSubflows(value: unknown, issues: AutomationStudioProjectSupervisorInputIssue[]): Written[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ code: value === undefined ? "project.missing_field" : "project.not_array", path: "subflows" });
    return undefined;
  }
  if (!value.length || value.length > MAX_SUBFLOWS) {
    issues.push({ code: value.length ? "project.too_many" : "project.plan_no_subflows", path: "subflows" });
    return undefined;
  }
  // Core's own router entry, sent back, is left out (header).
  const routers = new Set(value.length > 1 ? value.flatMap((raw) => (coresRouter(raw) ? [raw.key as string] : [])) : []);
  const read = value.map((raw, at) => {
    if (routers.size && coresRouter(raw)) return null;
    const parsed = shape.parse(() => readSubflow(raw, at, routers));
    if (parsed.status === "invalid") issues.push({ code: parsed.code, path: parsed.path });
    return parsed.status === "valid" ? parsed.value : undefined;
  });
  if (read.some((subflow) => subflow === undefined)) return undefined;
  const subflows = read.filter((subflow): subflow is Written => subflow !== null);
  if (!subflows.length) {
    issues.push({ code: "project.plan_no_subflows", path: "subflows" });
    return undefined;
  }
  const keys = new Map<string, number>();
  for (const subflow of subflows) {
    if (keys.has(subflow.key)) issues.push({ code: "project.duplicate_subflow", path: `subflows.${subflow.at}.key` });
    else keys.set(subflow.key, subflow.at);
  }
  for (const subflow of subflows) {
    for (const [index, key] of subflow.after.entries()) {
      if (key === subflow.key || !keys.has(key)) issues.push({ code: "project.plan_after_unknown", path: `subflows.${subflow.at}.after.${index}` });
    }
  }
  if (!issues.length && circular(subflows)) issues.push({ code: "project.plan_after_cycle", path: "subflows" });
  return issues.length ? undefined : subflows;
}

/** One subflow as written, `after` with Core's left-out router keys taken out (header); throws a refusal for `shape.parse`. */
function readSubflow(value: unknown, at: number, routers: ReadonlySet<string>): Written {
  const path = `subflows.${at}`;
  const fields = shape.object(value, path, ["key", "name", "parts"], ["purpose", "inputs", "outputs", "after"]);
  const key = shape.id(fields.key, `${path}.key`, 64);
  if (!SUBFLOW_KEY.test(key)) return shape.refuse("project.plan_subflow_key", `${path}.key`);
  const parts = shape.ids(fields.parts, `${path}.parts`, MAX_PARTS);
  if (!parts.length) return shape.refuse("project.plan_subflow_no_parts", `${path}.parts`);
  const subflow: Written = {
    at,
    key,
    name: shape.text(fields.name, `${path}.name`, 200).trim(),
    parts,
    inputs: ports(fields.inputs, `${path}.inputs`),
    outputs: ports(fields.outputs, `${path}.outputs`),
    after: fields.after === undefined ? [] : shape.ids(fields.after, `${path}.after`, MAX_SUBFLOWS).filter((before) => !routers.has(before))
  };
  if (fields.purpose !== undefined) subflow.purpose = shape.text(fields.purpose, `${path}.purpose`, 500).trim();
  return subflow;
}

/** Whether `value` is Core's router-run subflow as a plan's answer lists it: keyed as Core keys it, with no parts and no values (header). */
function coresRouter(value: unknown): value is JsonObject {
  if (!isObject(value) || typeof value.key !== "string" || !ROUTER_KEY.test(value.key)) return false;
  const empty = (field: unknown) => field === undefined || (Array.isArray(field) && !field.length);
  return Array.isArray(value.parts) && !value.parts.length && empty(value.inputs) && empty(value.outputs);
}

/** The names of an interface side, each a port name, none twice. */
function ports(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  const names = shape.array(value, path, MAX_PORTS).map((name, index) => (typeof name === "string" && PORT_NAME.test(name) ? name : shape.refuse("project.plan_port_name", `${path}.${index}`)));
  if (new Set(names).size !== names.length) return shape.refuse("project.duplicate", path);
  return names;
}

/** Whether `after` makes a circle, so no subflow in it could run first. */
function circular(subflows: readonly Written[]): boolean {
  const placed = new Set<string>();
  while (placed.size < subflows.length) {
    const next = subflows.find((subflow) => !placed.has(subflow.key) && subflow.after.every((key) => placed.has(key)));
    if (!next) return true;
    placed.add(next.key);
  }
  return false;
}

/** The structure plan's body, `partOf` and the chat's purposes, from what was written (header). */
function compile(written: readonly Written[]): { plan: AutomationStudioFlowBootstrapPlan; partOf: Record<string, string[]>; purposes: Record<string, string> } {
  const only = written.length === 1 && !written[0]!.inputs.length && !written[0]!.outputs.length ? written[0] : undefined;
  const routed = only?.key ?? routerKey(new Set(written.map((subflow) => subflow.key)));
  const subflows: AutomationStudioFlowBootstrapSubflow[] = only ? [] : [{ key: routed, name: GUIDANCE.router.name, role: "primary", nodes: [], edges: [] }];
  const partOf: Record<string, string[]> = only ? {} : { [routed]: [] };
  const purposes: Record<string, string> = only ? {} : { [routed]: GUIDANCE.router.purpose };
  for (const subflow of written) {
    const body: AutomationStudioFlowBootstrapSubflow = { key: subflow.key, name: subflow.name, role: only ? "primary" : "utility", nodes: [], edges: [] };
    if (!only) body.interface = { inputs: subflow.inputs.map(port), outputs: subflow.outputs.map(port) };
    subflows.push(body);
    partOf[subflow.key] = [...subflow.parts];
    if (subflow.purpose) purposes[subflow.key] = subflow.purpose;
  }
  return { plan: { schemaVersion: "0.1", router: { name: GUIDANCE.router.name, rules: [], fallback: { kind: "subflow", targetSubflowKey: routed } }, subflows }, partOf, purposes };
}

/** `main`, or the first `main_<n>` no written subflow has. */
function routerKey(taken: ReadonlySet<string>): string {
  if (!taken.has("main")) return "main";
  let index = 2;
  while (taken.has(`main_${index}`)) index += 1;
  return `main_${index}`;
}

function port(name: string): AutomationStudioFlowBootstrapInterfacePort {
  return { id: name, name, valueType: { kind: "unknown" } };
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
