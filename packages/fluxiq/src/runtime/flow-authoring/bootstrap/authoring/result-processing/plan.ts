// The draft's result processing written onto the plan's record outputs (t970).
//
// The processing is held on the draft, apart from the steps
// (`../../../draft/result-processing/held.ts`), and set by its own tool; the saved Flow
// runs it where every record output's processing runs, at the run's end in the
// store. So once the plan is assembled, each record output it applies to takes
// it, and a replay of the saved Flow makes the same answer with no model call.
//
// **Merged over what the output already declares.** A read's own `dedupe`,
// `sort` or `limit`, and the `columns` assembly derives from the request, stay
// unless the declaration says otherwise: the declaration says only what it
// changes.
//
// **A column read only to filter by is stored and not shown.** A request that
// names its columns narrows the output's schema to them
// (`../assembled-record-output.ts`), and a mark the read takes only to decide a
// row -- a badge, a label -- is then not stored, so nothing could filter by it.
// Each field the declaration names that the node reads and the schema lacks is
// added to the schema, as `../../record-defaults/process-fields.ts` adds what a
// written `process` names; and where the declaration writes no `columns` and
// none were declared, the answer's columns become the schema's columns from
// before, so the added fields are stored and never shown.
//
// A declaration the output's schema cannot take even so -- a column the read
// does not read -- is refused for that output with a warning naming it, and the
// output keeps its own processing.

import { parseAutomationStudioRecordProcessing, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftResultProcessingFor, type AutomationStudioFlowDraftResultProcessing } from "../../../draft/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { authoringWarning } from "../issue.ts";
import { isJsonObject } from "../values.ts";

/** The plan with the draft's result processing written onto each record output it applies to, and a warning for each it could not be. */
export function automationStudioFlowBootstrapPlanWithResultProcessing(
  plan: AutomationStudioFlowBootstrapPlan,
  held: AutomationStudioFlowDraftResultProcessing | undefined
): { plan: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[] } {
  if (held === undefined || Object.keys(held).length === 0) return { plan, issues: [] };
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const subflows = plan.subflows.map((subflow, subflowIndex) => ({
    ...subflow,
    nodes: subflow.nodes.map((node, nodeIndex) => {
      const parameters = node.parameters;
      if (!parameters) return node;
      const read = readFields(parameters);
      let changed: JsonObject | undefined;
      for (const [id, value] of Object.entries(parameters)) {
        if (!isRecordOutput(value)) continue;
        const declared = automationStudioFlowDraftResultProcessingFor(held, { datasetId: value.datasetId, purpose: typeof value.purpose === "string" ? value.purpose : undefined });
        if (declared === undefined) continue;
        const written = withProcessing(value, declared, read);
        const path = `subflows.${subflowIndex}.nodes.${nodeIndex}.parameters.${id}`;
        if (!written) {
          issues.push(authoringWarning("result_processing.not_applicable", `The result processing names a column the read at ${path} does not read, so that read keeps its own processing.`, path));
          continue;
        }
        changed = { ...(changed ?? parameters), [id]: written };
      }
      return changed ? { ...node, parameters: changed } : node;
    })
  }));
  return { plan: { ...plan, subflows }, issues };
}

/** A parameter holding a record output, found by its shape as the contract writes one: a dataset id and a schema. */
function isRecordOutput(value: JsonValue): value is JsonObject & { datasetId: string; schema: JsonObject } {
  return isJsonObject(value) && typeof value.datasetId === "string" && isJsonObject(value.schema);
}

/** The output with the declaration merged over its own processing, its schema widened by the fields only the declaration reads (header); `undefined` when its schema cannot take it. */
function withProcessing(output: JsonObject & { schema: JsonObject }, declared: AutomationStudioRecordProcessing, read: readonly string[]): JsonObject | undefined {
  const fields = Array.isArray(output.schema.fields) ? output.schema.fields.filter(isJsonObject) : [];
  const stored = fields.flatMap((field) => (typeof field.id === "string" ? [field.id] : []));
  const own = isJsonObject(output.process) ? output.process : {};
  const derived = new Set((declared.derive ?? []).map((field) => field.id));
  const extra = namedFields(declared).filter((id, at, all) => all.indexOf(id) === at && !derived.has(id) && !stored.includes(id) && read.includes(id));
  const schema = extra.length ? { ...output.schema, fields: [...fields, ...extra.map((id) => ({ id, label: id, valueType: "string" }))] } : output.schema;
  const columns = declared.columns ?? (Array.isArray(own.columns) ? undefined : extra.length ? stored : undefined);
  const merged: JsonObject = { ...own, ...(declared as unknown as JsonObject), ...(columns ? { columns } : {}) };
  const parsed = parseAutomationStudioRecordProcessing(merged, schema as unknown as AutomationStudioRecordSchema);
  if (!parsed.ok) return undefined;
  return { ...output, schema, process: parsed.processing as unknown as JsonObject };
}

/** Every column a declaration reads: the sources of its derived columns, its filters', comparisons', sort's and dedupe's columns, and its `columns`. */
function namedFields(process: AutomationStudioRecordProcessing): string[] {
  return [
    ...(process.derive ?? []).map((field) => field.from),
    ...(process.where ?? []).map((condition) => condition.field),
    ...(process.anyOf ?? []).flatMap((group) => group.map((condition) => condition.field)),
    ...(process.compare ?? []).flatMap((comparison) => [comparison.field, comparison.atLeast, comparison.atMost, comparison.lessThan, comparison.greaterThan, comparison.equals].filter((id): id is string => id !== undefined)),
    ...(process.sort ?? []).map((key) => key.field),
    ...(process.dedupe ? process.dedupe.by : []),
    ...(process.columns ?? [])
  ];
}

/** The field keys the node reads: the keys of the first parameter object holding a `fields` or `columns` map or list, as assembly finds them (`../assembled-record-output.ts`). */
function readFields(parameters: JsonObject): string[] {
  for (const value of Object.values(parameters)) {
    if (!isJsonObject(value) || isRecordOutput(value)) continue;
    const fields = value.fields ?? value.columns;
    if (isJsonObject(fields)) return Object.keys(fields);
    if (Array.isArray(fields)) return fields.filter((item): item is string => typeof item === "string");
  }
  return [];
}
