// One node's parameters, as the model wrote them and as the registry declares
// them.
//
// Three things happen here and nothing else. A key is matched to the parameter
// it names, however the model spelled it. A value is read as the declared type
// wants it -- one item where a list belongs, a name where an object belongs,
// `no` where a boolean belongs -- and a record output is filled in from what
// the node already knows (`./record-output.ts`). Then every parameter the
// model left out that declares a default is written in explicitly, so the Flow
// a person opens shows the value the step will actually use rather than a blank.
//
// A parameter with no default and no requirement stays absent: nothing is
// invented for a node that does not ask for it. A key that names no parameter
// is refused, not dropped, because where it was meant to go is exactly what
// cannot be guessed; the refusal is fed back with the node's parameter ids.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeParameter, AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import { authoringError } from "./issue.ts";
import { authoringKey } from "./keys.ts";
import { matchAuthoringParameter } from "./matching.ts";
import { normaliseAuthoringRecordOutput } from "./record-output.ts";
import { AUTOMATION_STUDIO_AUTHORING_HANDLE_KEY, isAuthoringHandleToken, isJsonObject } from "./values.ts";

/** The parameters one node runs with, from the keys and values the model wrote. */
export function normaliseAuthoringNodeParameters(input: {
  definition: AutomationStudioNodeDefinition;
  /** Every key the model wrote for this node, already merged from wherever it wrote it. */
  written: Readonly<Record<string, JsonValue>>;
  /** Where this node sits in the plan, for the path an issue carries. */
  path: string;
  /** What a derived name falls back to: the step's own words. */
  fallbackName: string;
}): { parameters: JsonObject; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const parameters: JsonObject = {};
  for (const [key, value] of Object.entries(input.written)) {
    const parameter = matchAuthoringParameter(key, input.definition);
    if (!parameter) {
      issues.push(authoringError("bootstrap.unknown_parameter", "Node parameter is not declared by its definition.", `${input.path}.parameters.${key}`));
      continue;
    }
    if (parameters[parameter.id] === undefined) parameters[parameter.id] = coerce(value, parameter);
  }
  for (const parameter of input.definition.parameters) {
    if (parameter.ui?.control !== "record-output") continue;
    const read = normaliseAuthoringRecordOutput({
      value: parameters[parameter.id],
      definition: input.definition,
      columns: columnNames(parameters),
      fallbackName: input.fallbackName,
      path: `${input.path}.parameters.${parameter.id}`
    });
    if (read.value !== undefined) parameters[parameter.id] = read.value;
    issues.push(...read.issues);
  }
  materialiseDefaults(input.definition, parameters);
  return { parameters, issues };
}

/**
 * Every parameter the model left out that declares a default, written in.
 *
 * The catalog already shows each default, and validation already accepts a
 * missing parameter that has one -- but nothing put the value on the node, so a
 * created Flow showed a person a blank field whose behaviour came from
 * somewhere they could not see. A parameter with no default is left absent:
 * required and missing is still a refusal, optional and missing is still
 * nothing.
 */
export function materialiseDefaults(definition: AutomationStudioNodeDefinition, parameters: JsonObject): void {
  for (const parameter of definition.parameters) {
    if (parameters[parameter.id] === undefined && parameter.defaultValue !== undefined) {
      parameters[parameter.id] = structuredClone(parameter.defaultValue);
    }
  }
}

/** A value read as the parameter's declared type wants it, where that reading is the only one. */
function coerce(value: JsonValue, parameter: AutomationNodeParameter): JsonValue {
  if (parameter.ui?.control === "record-output") return value;
  const type = parameter.valueType;
  if (type === "array" && !Array.isArray(value)) return value === null ? [] : [value];
  if ((type === "object" || type === "json") && typeof value === "string") {
    return isAuthoringHandleToken(value) ? { [AUTOMATION_STUDIO_AUTHORING_HANDLE_KEY]: value } : value;
  }
  if (type === "boolean" && typeof value === "string") {
    const word = authoringKey(value);
    if (word === "true" || word === "yes") return true;
    if (word === "false" || word === "no") return false;
  }
  if (type === "number" && typeof value === "string") {
    const count = Number(value.trim());
    if (value.trim() && Number.isFinite(count)) return count;
  }
  if ((type === "string" || type === "expression") && (typeof value === "number" || typeof value === "boolean")) return String(value);
  if (Array.isArray(value) && value.length === 1 && type !== "array" && type !== "json") return value[0] as JsonValue;
  return value;
}

/** The column names a node already asks for, used when a record output names none. */
function columnNames(parameters: JsonObject): string[] {
  for (const value of Object.values(parameters)) {
    if (!isJsonObject(value)) continue;
    const fields = value.fields ?? value.columns;
    if (isJsonObject(fields)) return Object.keys(fields);
    if (Array.isArray(fields)) return fields.filter((item): item is string => typeof item === "string");
  }
  return [];
}
