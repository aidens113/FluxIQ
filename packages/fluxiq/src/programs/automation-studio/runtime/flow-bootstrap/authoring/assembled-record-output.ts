// The record output assembly writes on one record-output parameter of a node.
//
// One derivation, read in two places. Assembly (`./normalise.ts`) writes it on
// the plan node, so the stored Flow dispatches it. The build's test replays the
// draft step the node was written from (`../../llm/node-tools/replay.ts`), and
// a step that ran with no record output has to send the one the Flow will
// send, or the test saves its rows in a dataset the run never writes. Two
// derivations would drift; this is the one both read.
//
// An extraction -- a node whose own result keeps rows and that reads at least
// one named field -- is always given a record output, so every read writes a
// dataset of its own rather than one the domain derives at dispatch, where two
// reads could land in one. Left undeclared, it stores every field it reads,
// helpers and all; one the instruction names columns for declares them
// (`./instruction-record-columns.ts`). A node that keeps no rows, or reads no
// named field, gains nothing, and a record output the model wrote is read as
// the contract's (`./record-output.ts`).
//
// A node given its rows as written -- Write Records' `records` parameter, rows
// of values read one by one (t738) -- is given one too when it declares none,
// and its columns, where no schema is written, are the rows' own keys. That
// parameter is told apart by standing in for an input port of the same id: the
// rows the node is otherwise handed on that port.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { isAutomationNodeParameterStateBinding, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { automationStudioFlowBootstrapDeclaredRecordsPath, type AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import { authoringInstructionRecordColumns } from "./instruction-record-columns.ts";
import { authoringWarning } from "./issue.ts";
import { normaliseAuthoringRecordOutput } from "./record-output.ts";
import { isJsonObject } from "./values.ts";

/**
 * The value one record-output parameter holds once assembled, and what reading
 * it found. `value` is what the parameter held (`undefined` or `null`) when
 * the node is not an extraction and the model wrote none.
 */
export function automationStudioFlowBootstrapAssembledRecordOutput(input: {
  definition: AutomationStudioNodeDefinition;
  /** The record-output parameter, by id. */
  parameterId: string;
  /** The node's parameters, as read so far: where the fields it reads are found. */
  parameters: Readonly<JsonObject>;
  /** What a derived name falls back to: the step's own words. */
  fallbackName: string;
  /** The id this step keeps every time the same plan is assembled (`./record-output.ts`). */
  stepId?: string | undefined;
  /** The columns the instruction names (`./instruction-record-columns.ts`). */
  namedColumns?: readonly string[] | undefined;
  /** Where the parameter sits in the plan, for the path an issue carries. */
  path: string;
}): { value: JsonValue | undefined; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const fieldKeys = columnNames(input.parameters);
  const asked = instructionColumns(input.definition, input.namedColumns, fieldKeys);
  const written = input.parameters[input.parameterId];
  const undeclared = written === undefined || written === null;
  const extraction = fieldKeys.length > 0 && automationStudioFlowBootstrapDeclaredRecordsPath(input.definition) !== undefined;
  const rowKeys = writtenRowKeys(input.definition, input.parameters);
  const read = normaliseAuthoringRecordOutput({
    value: undeclared && (asked?.columns.length || extraction || rowKeys.length) ? {} : written,
    definition: input.definition,
    columns: asked?.columns.length ? asked.columns : fieldKeys.length ? fieldKeys : rowKeys,
    fallbackName: input.fallbackName,
    stepId: input.stepId,
    labelFromFallback: undeclared,
    path: input.path
  });
  issues.push(...read.issues);
  if (asked?.unmatched.length && (undeclared || read.schemaDerived)) {
    issues.push(authoringWarning(
      "record_output.named_column_unmatched",
      `The instruction names ${asked.unmatched.map((name) => `"${name}"`).join(", ")} as columns, and no field this extraction reads is called that, so ${asked.columns.length
        ? `it stores only the named columns it does read: ${asked.columns.map((column) => column.id).join(", ")}`
        : "it stores every field it reads"}. Read a field under each name the instruction gives if it asked for that column.`,
      input.path
    ));
  }
  return { value: read.value, issues };
}

/**
 * The instruction's columns matched to an extraction's fields, or `undefined`
 * for a node that is not an extraction -- one whose own result keeps no rows --
 * or that reads no named field, or an instruction that names no column.
 */
function instructionColumns(
  definition: AutomationStudioNodeDefinition,
  named: readonly string[] | undefined,
  fieldKeys: readonly string[]
): ReturnType<typeof authoringInstructionRecordColumns> | undefined {
  if (!named?.length || !fieldKeys.length) return undefined;
  if (automationStudioFlowBootstrapDeclaredRecordsPath(definition) === undefined) return undefined;
  return authoringInstructionRecordColumns({ named, fieldKeys });
}

/** The column names a node already asks for, used when a record output names none. */
function columnNames(parameters: Readonly<JsonObject>): string[] {
  for (const value of Object.values(parameters)) {
    if (!isJsonObject(value)) continue;
    const fields = value.fields ?? value.columns;
    if (isJsonObject(fields)) return Object.keys(fields);
    if (Array.isArray(fields)) return fields.filter((item): item is string => typeof item === "string");
  }
  return [];
}

/**
 * The keys of the rows a node is given as written, in the order first written,
 * or none: a parameter standing in for an input port of the same id, holding a
 * list of objects (see the header). A binding in place of a row names no key.
 */
function writtenRowKeys(definition: AutomationStudioNodeDefinition, parameters: Readonly<JsonObject>): string[] {
  const ports = new Set(definition.inputs.map((port) => port.id));
  const keys = new Set<string>();
  for (const parameter of definition.parameters) {
    const rows = parameters[parameter.id];
    if (!ports.has(parameter.id) || !Array.isArray(rows)) continue;
    for (const row of rows) if (isJsonObject(row) && !isAutomationNodeParameterStateBinding(row)) for (const key of Object.keys(row)) keys.add(key);
  }
  return [...keys];
}
