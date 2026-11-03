// The two members of a Flow test's replay that hold a row's values, written by
// their field names only (t252 D6).
//
// A repeated step is replayed once per row, sent with the row under `item`
// (`../node-tools/replay.ts`), and a replayed list read answers with the rows
// it read under `outputs` (`../evidence-loop/tool-execution.ts`). Both are page
// data the model is never shown; the step log is read by people and by the Lab,
// and a person debugging a loop needs to see that a pass carried a row with
// these fields, not what the row said. So `call.json` writes `item` as
// `{ fields: [...] }`, and `meta.json` writes `outputs` as each port's field
// names. Anything else in the call is written as it was.

/** The member a replay's row travels under, the word the For Each hands a node. */
const ROW_KEY = "item";

/** A call's input with its row, if any, as field names; anything else as it came. */
function call(value: unknown): unknown {
  if (!isRecord(value) || !Object.hasOwn(value, ROW_KEY)) return value;
  return { ...value, [ROW_KEY]: { fields: fieldsOf(value[ROW_KEY]) } };
}

/** A result's output values as each port's field names; nothing when it carried none. */
function outputs(value: unknown): Record<string, { fields: string[] }> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).map(([port, held]) => [port, { fields: fieldsOf(held) }]));
}

/** The field names a row, or a list of rows, holds: never a value. */
function fieldsOf(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : [value];
  const names = new Set<string>();
  for (const row of rows) if (isRecord(row)) for (const key of Object.keys(row)) names.add(key);
  return [...names];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The step log's writer for a replay's row and output values: field names only. */
export const automationStudioLlmStepLogFieldNames = { call, outputs };
