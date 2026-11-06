// The columns a repeat reads from its rows, kept by the listing that gives them (t869).
//
// A `repeat over: <listing>` span becomes a For Each fed by the listing's `records`
// (`../../authoring/draft-routing.ts`), and those are the rows the listing's record output
// keeps: its schema is an allowlist, and a column it leaves out reaches no later node
// (`engine/automation/records/capture.ts`). Assembly may narrow that schema to the columns the
// instruction names (`../../authoring/instruction-record-columns.ts`), so "a table with columns
// title, price and status" stores those and nothing else. A step in the span bound to a row's
// field the instruction did not name, `$row.url` on the step that opens each row by its address,
// then found no value on every run of the saved Flow and failed
// `executor.parameter.unresolved_state_path` before it ran. The build's own test did not: it
// derives the record output without the instruction's columns
// (`../../../../llm/node-tools/replay/replay.ts`), so its rows still held the field. Every later
// attempt of such a Flow went to the model to repair a step that was never wrong.
//
// So once the plan is assembled, each field a step in a For Each's body reads from the row
// (`{"$state":{"path":"item.<field>"}}`) and its listing reads but does not keep is added to the
// listing's record output, the way a field its process sorts by is kept
// (`../../authoring/record-output.ts`, `withProcessFields`). It is stored, not shown: a record
// output that names no `process.columns` is given the columns it showed before, so the answer
// the person asked for stays exactly as it was. Only a field the listing reads is added, so a
// row field nothing reads stays a refusal elsewhere (`../../authoring/draft-bindings.ts`), and a
// listing whose output already keeps every field the span reads is left as it was.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { isAutomationNodeParameterStateBinding, type AutomationStudioNodeRegistry, type AutomationStudioNodeRegistryResolution } from "../../../../../framework/automation-service/nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan, AutomationStudioFlowBootstrapSubflow } from "../../plan/index.ts";
import { automationStudioFlowPlanLoopBody } from "../loop-body.ts";

/** The node a `repeat over` span becomes, and the input its rows arrive on. */
const FOR_EACH_ID = "builtin.control.for-each";
const ROWS_INPUT = "items";
/** The name the row a pass is on goes by in state. */
const ROW_NAME = "item";
/** The control a record-output parameter declares (`../../authoring/assembled-record-output.ts`). */
const RECORD_OUTPUT_CONTROL = "record-output";
/** How deep a parameter value is searched, as far as the executor resolves one. */
const MAXIMUM_DEPTH = 16;
/** A field id the record schema takes as it is (`../../authoring/keys.ts`, `authoringFieldId`). */
const FIELD_ID = /^[A-Za-z0-9_-]{1,100}$/u;

/** The plan with each listing a repeat walks keeping the row fields the repeat reads; the same plan when none needed it (header). */
export function automationStudioFlowPlanRepeatRowFields(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapPlan {
  let changed = false;
  const subflows = input.plan.subflows.map((subflow) => {
    const kept = keptSubflow(subflow, input.registry, input.resolution);
    if (kept !== subflow) changed = true;
    return kept;
  });
  return changed ? { ...input.plan, subflows } : input.plan;
}

function keptSubflow(subflow: AutomationStudioFlowBootstrapSubflow, registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): AutomationStudioFlowBootstrapSubflow {
  const byKey = new Map(subflow.nodes.map((node) => [node.key, node]));
  // The fields each listing's rows are read for, over every For Each it feeds.
  const wanted = new Map<string, Set<string>>();
  for (const each of subflow.nodes) {
    if (each.definitionId !== FOR_EACH_ID) continue;
    const feed = subflow.edges.find((edge) => edge.target.nodeKey === each.key && edge.target.portId === ROWS_INPUT);
    if (!feed || !byKey.has(feed.source.nodeKey)) continue;
    const fields = wanted.get(feed.source.nodeKey) ?? new Set<string>();
    for (const key of automationStudioFlowPlanLoopBody(subflow, each.key)) rowFields(byKey.get(key)?.parameters, 0, fields);
    if (fields.size) wanted.set(feed.source.nodeKey, fields);
  }
  if (!wanted.size) return subflow;
  let changed = false;
  const nodes = subflow.nodes.map((node) => {
    const fields = wanted.get(node.key);
    const definition = fields ? registry.get(node.definitionId, resolution) : undefined;
    if (!fields || !definition || !node.parameters) return node;
    const read = readFields(node.parameters);
    let parameters: JsonObject | undefined;
    for (const parameter of definition.parameters) {
      if (parameter.ui?.control !== RECORD_OUTPUT_CONTROL) continue;
      const output = (parameters ?? node.parameters)[parameter.id];
      const widened = isObject(output) ? keeping(output, [...fields].filter((field) => read.has(field))) : undefined;
      if (widened) parameters = { ...(parameters ?? node.parameters), [parameter.id]: widened };
    }
    if (!parameters) return node;
    changed = true;
    return { ...node, parameters };
  });
  return changed ? { ...subflow, nodes } : subflow;
}

/** The record output with each of `fields` its schema leaves out stored and not shown, or nothing when it keeps them all. */
function keeping(output: JsonObject, fields: readonly string[]): JsonObject | undefined {
  const schema = isObject(output.schema) ? output.schema : undefined;
  const declared = Array.isArray(schema?.fields) ? schema.fields.filter(isObject) : undefined;
  if (!schema || !declared) return undefined;
  const held = new Set(declared.map((field) => field.id));
  const missing = fields.filter((field) => FIELD_ID.test(field) && !held.has(field));
  if (!missing.length) return undefined;
  const labels = new Set(declared.map((field) => typeof field.label === "string" ? field.label.toLowerCase() : ""));
  const added = missing.map((id) => {
    let label = id;
    while (labels.has(label.toLowerCase())) label = `${label} (row)`;
    labels.add(label.toLowerCase());
    return { id, label, valueType: "string" } satisfies JsonObject;
  });
  // What the answer showed before: its own columns when it names them, else every stored field.
  const process = isObject(output.process) ? output.process : {};
  const shown = Array.isArray(process.columns) ? process.columns : declared.filter((field) => field.handling !== "exclude").map((field) => field.id as JsonValue);
  return { ...output, schema: { ...schema, fields: [...declared, ...added] }, process: { ...process, columns: shown } };
}

/** Each row field a parameter value reads, `item.<field>` in a state binding, into `into`. */
function rowFields(value: JsonValue | undefined, depth: number, into: Set<string>): void {
  if (value === undefined || value === null || typeof value !== "object" || depth > MAXIMUM_DEPTH) return;
  if (isAutomationNodeParameterStateBinding(value)) {
    const [root, field] = value.$state.path.split(".");
    if (root === ROW_NAME && field) into.add(field);
    return;
  }
  for (const inner of Array.isArray(value) ? value : Object.values(value)) rowFields(inner, depth + 1, into);
}

/** The field names a listing reads: the keys of a `fields` object, or a `columns` list, in any of its parameters. */
function readFields(parameters: JsonObject): ReadonlySet<string> {
  for (const value of Object.values(parameters)) {
    if (!isObject(value)) continue;
    const fields = value.fields ?? value.columns;
    if (isObject(fields)) return new Set(Object.keys(fields));
    if (Array.isArray(fields)) return new Set(fields.filter((item): item is string => typeof item === "string"));
  }
  return new Set();
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
