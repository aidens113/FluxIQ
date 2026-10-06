// One node's parameters, as the model wrote them and as the registry declares
// them.
//
// Three things happen here and nothing else. A key is matched to the parameter
// it names, however the model spelled it. A value is read as the declared type
// wants it -- one item where a list belongs, a name where an object belongs,
// `no` where a boolean belongs -- and a record output is filled in from what
// the node already knows (`./assembled-record-output.ts`) -- for an extraction
// whose author declared no columns, the columns the instruction names, and for
// an extraction whose author declared no record output at all, one of its own. Then every parameter the
// model left out that declares a default is written in explicitly, so the Flow
// a person opens shows the value the step will actually use rather than a blank.
//
// A parameter with no default and no requirement stays absent: nothing is
// invented for a node that does not ask for it. A key that names no parameter
// is refused, not dropped, because where it was meant to go is exactly what
// cannot be guessed; the refusal is fed back with the node's parameter ids.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { isAutomationNodeParameterStateBinding, type AutomationNodeParameter, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { automationStudioMatchWrittenParameterName, type AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import { automationStudioFlowBootstrapAssembledRecordOutput } from "./assembled-record-output.ts";
import { isAuthoringConsequenceKey, readAuthoringConsequences } from "./consequences.ts";
import { authoringError } from "./issue.ts";
import { authoringKey } from "./keys.ts";
import { matchAuthoringParameter, matchAuthoringParameterContaining } from "./matching.ts";
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
  /**
   * The id this step keeps every time the same plan is assembled, appended to
   * a dataset id derived here so two reads never share a dataset by accident
   * (`./record-output.ts`). Absent, a derived id is the name alone.
   */
  stepId?: string | undefined;
  /**
   * The columns the instruction names (`../answerability/instruction-columns.ts`),
   * declared as the schema of an extraction whose author declared none. Absent
   * or empty, every record output is read exactly as before.
   */
  namedColumns?: readonly string[] | undefined;
}): { parameters: JsonObject; issues: AutomationStudioFlowBootstrapIssue[]; consequences?: string[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const parameters: JsonObject = {};
  // Which declared parameters are already spoken for, so a near match can never
  // take a name the model wrote correctly somewhere else in the same node.
  // Seeded with the keys that are declared ids outright, because those are
  // claimed however late in the object they appear.
  const declaredIds = new Set(input.definition.parameters.map((parameter) => parameter.id));
  const claimed = new Set(Object.keys(input.written).filter((key) => declaredIds.has(key)));
  // The step's declaration of what it would lastingly do, when it rode in with
  // the keys: it is not a parameter of any node, so the reader that would
  // otherwise refuse it as unknown takes it out here (`./consequences.ts`).
  let consequences: string[] | undefined;
  for (const [key, value] of Object.entries(input.written)) {
    const parameter = matchAuthoringParameter(key, input.definition);
    if (!parameter && isAuthoringConsequenceKey(key)) {
      const declared = readAuthoringConsequences(value);
      if (declared) consequences = declared;
      else issues.push(authoringError("bootstrap.invalid_consequences", "Step consequences must name the permission classes, or none.", `${input.path}.consequences`));
      continue;
    }
    if (!parameter) {
      // A key exactly one structured parameter declares as its own is read as
      // having been written inside it, as `./matching.ts` explains.
      const inside = matchAuthoringParameterContaining(key, input.definition);
      if (!inside) {
        // Nothing here knows this key by name or by containment, so before
        // refusing it, resolve it as the nearest parameter this node declares.
        // A name is a small slip and a refusal is a paid provider call the
        // evidence says the model does not act on: `run-mug776kx-0214b287` was
        // refused the same way fourteen times and corrected none of them.
        //
        // This is the reader that decides, which is why the fallback has to be
        // here: the plan's own correction runs later, and a key refused on this
        // path never reaches it.
        const near = automationStudioMatchWrittenParameterName(key, value, input.definition, claimed);
        const resolved = near && input.definition.parameters.find((parameter) => parameter.id === near.id);
        if (resolved) {
          claimed.add(resolved.id);
          if (parameters[resolved.id] === undefined) parameters[resolved.id] = coerce(value, resolved);
          continue;
        }
        issues.push(authoringError("bootstrap.unknown_parameter", "Node parameter is not declared by its definition.", `${input.path}.parameters.${key}`));
        continue;
      }
      const existing = parameters[inside.id];
      const base: JsonObject = isJsonObject(existing) ? existing : {};
      if (base[key] === undefined) base[key] = value;
      parameters[inside.id] = base;
      continue;
    }
    claimed.add(parameter.id);
    if (parameters[parameter.id] === undefined) parameters[parameter.id] = coerce(value, parameter);
  }
  for (const parameter of input.definition.parameters) {
    if (parameter.ui?.control !== "record-output") continue;
    // The same derivation the build's test sends for a step that ran with none
    // (`./assembled-record-output.ts`), so the test and the Flow write one dataset.
    const read = automationStudioFlowBootstrapAssembledRecordOutput({
      definition: input.definition,
      parameterId: parameter.id,
      parameters,
      fallbackName: input.fallbackName,
      stepId: input.stepId,
      namedColumns: input.namedColumns,
      path: `${input.path}.parameters.${parameter.id}`
    });
    if (read.value !== undefined) parameters[parameter.id] = read.value;
    issues.push(...read.issues);
  }
  materialiseDefaults(input.definition, parameters);
  return { parameters, issues, ...(consequences ? { consequences } : {}) };
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
  // A state binding is resolved at run time into a value of the declared type;
  // reading it as one here would wrap it in a list or stringify it.
  if (isAutomationNodeParameterStateBinding(value)) return value;
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
