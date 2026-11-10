// Fixed sentences for data steps (rule 6): Core's `builtin.data.*` nodes and a
// pipeline's steps (`builtin.data.pipeline-step`, whose `step` parameter is the
// declared data step). Nothing for a data node these sentences do not cover;
// the caller then says it the way a card does.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import { outlineExpressionWords } from "./expression.ts";
import { outlineFieldWords } from "./field.ts";
import { outlineValueWords } from "./value.ts";

const FILTER_LIST_RULES: Readonly<Record<string, string>> = {
  equals: "is",
  "not-equals": "is not",
  "greater-than": "is more than",
  "less-than": "is less than",
  contains: "contains"
};

/** The data step's fixed sentence, or nothing. */
export function outlineDataWords(node: AutomationStudioFlowNode): string | undefined {
  const params = node.parameterValues ?? {};
  switch (node.definitionId) {
    case "builtin.data.pipeline-step": {
      const step = record(params.step);
      return step ? pipelineStepWords(step) : undefined;
    }
    case "builtin.data.pipeline-source":
      return "Load the records";
    case "builtin.data.constant":
      return `Use the value ${outlineValueWords(params.value)}`;
    case "builtin.data.filter-list": {
      const field = typeof params.path === "string" && params.path ? params.path : "the item";
      if (params.operator === "exists") return `Keep items that have ${field}`;
      return `Keep items where ${field} ${FILTER_LIST_RULES[String(params.operator)] ?? "is"} ${outlineValueWords(params.value)}`;
    }
    case "builtin.data.get-variable":
      return `Read the saved value ${outlineValueWords(params.name)}`;
    case "builtin.data.set-variable":
      if (params.writeMode === "append-list") return `Add it to the list ${outlineValueWords(params.name)}`;
      if (params.writeMode === "merge-object") return `Add its fields to ${outlineValueWords(params.name)}`;
      return `Save it as ${outlineValueWords(params.name)}`;
    case "builtin.data.map-object":
      if (params.mode === "pick") return "Keep only some fields of each record";
      if (params.mode === "rename") return "Rename fields of each record";
      return "Add or change fields of each record";
    case "builtin.data.write-records":
      return "Save the rows as a table";
    default:
      return undefined;
  }
}

function pipelineStepWords(step: JsonObject): string | undefined {
  switch (step.kind) {
    case "filter":
      return `Keep rows where ${outlineExpressionWords(step.where)}`;
    case "sort":
      return `Sort by ${list(step.by).map(sortKeyWords).join(", then ")}`;
    case "limit":
      return typeof step.offset === "number" && step.offset > 0 ? `Keep ${step.count} rows after the first ${step.offset}` : `Keep the first ${outlineValueWords(step.count)}`;
    case "dedupe":
      return `Remove duplicates by ${list(step.key).map(outlineFieldWords).join(" and ")}`;
    case "join":
      return "Add the matching rows from another list";
    case "aggregate":
      return list(step.groupBy).length ? `Group by ${list(step.groupBy).map(outlineFieldWords).join(" and ")} and work out totals` : "Work out totals over all rows";
    case "validate":
      return step.onInvalid === "drop" ? "Drop rows that do not have the right shape" : "Check every row has the right shape";
    case "transform":
      return "Change each row";
    case "sink":
      return sinkWords(record(step.to));
    default:
      return undefined;
  }
}

function sortKeyWords(key: JsonValue): string {
  const sort = record(key);
  if (!sort) return "a field";
  return `${outlineFieldWords(sort.field)}, ${sort.order === "desc" ? "highest first" : "lowest first"}`;
}

function sinkWords(to: JsonObject | undefined): string {
  if (to?.kind === "dataset") return `Save to dataset ${outlineValueWords(to.name)}`;
  if (to?.kind === "file") return `Export to the file ${outlineValueWords(to.path)}`;
  if (to?.kind === "webhook") return "Send the rows to a web address";
  return "Hand the rows to the program";
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
