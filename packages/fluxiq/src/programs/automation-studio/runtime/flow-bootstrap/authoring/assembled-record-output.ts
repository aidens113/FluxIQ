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
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
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
  const read = normaliseAuthoringRecordOutput({
    value: undeclared && (asked?.columns.length || extraction) ? {} : written,
    definition: input.definition,
    columns: asked?.columns.length ? asked.columns : fieldKeys,
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
