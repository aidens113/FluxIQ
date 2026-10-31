// Core's record of a no, read back from whatever carried it (t633, t641): a
// trial's result hands it to a gate as any value a port answered, so a value
// not of the record's shape is no record. Moved here from `./memory.ts` so the
// gate's kept conditions (`./kept-conditions.ts`) read a record the same way.
// Its sets of conditions that left rows out only together (t666, `together`)
// are read the same way: a set not of the shape makes the record none.

import type {
  AutomationStudioResultStandingNoCall,
  AutomationStudioResultStandingNoCondition,
  AutomationStudioResultStandingNoKeptOutRow,
  AutomationStudioResultStandingNoLocated,
  AutomationStudioResultStandingNoRecord,
  AutomationStudioResultStandingNoTogether
} from "./types.ts";

/** A copy of `value` where it has the record's shape (`./types.ts`); nothing otherwise. */
export function automationStudioResultStandingNoRecordOf(value: unknown): AutomationStudioResultStandingNoRecord | undefined {
  if (!isObject(value) || !strings(value.stored) || typeof value.storedWhole !== "boolean" || !Array.isArray(value.conditions) || !Array.isArray(value.standing)) return undefined;
  if (value.upheldKind !== undefined && !strings(value.upheldKind)) return undefined;
  if (value.source !== undefined && value.source !== "core") return undefined;
  const located = value.located === undefined ? [] : Array.isArray(value.located) ? value.located.map(locatedOf) : [undefined];
  if (located.some((defect) => !defect)) return undefined;
  const conditions = value.conditions.map(conditionOf);
  const standing = value.standing.map(callOf);
  if (conditions.some((condition) => !condition) || standing.some((call) => !call)) return undefined;
  const together = value.together === undefined ? [] : Array.isArray(value.together) ? value.together.map(togetherOf) : [undefined];
  if (together.some((set) => !set)) return undefined;
  return {
    ...(value.source === "core" ? { source: "core" as const } : {}),
    ...(located.length ? { located: located as AutomationStudioResultStandingNoLocated[] } : {}),
    stored: [...value.stored],
    storedWhole: value.storedWhole,
    conditions: conditions as AutomationStudioResultStandingNoCondition[],
    ...(value.upheldKind?.length ? { upheldKind: [...value.upheldKind] } : {}),
    standing: standing as AutomationStudioResultStandingNoCall[],
    ...(together.length ? { together: together as AutomationStudioResultStandingNoTogether[] } : {})
  };
}

const LOCATED_KINDS = new Set(["kept_not_asked", "asked_missing", "wrong_value", "act_missing", "act_wrong", "other"]);

/** A copy of one located defect (`./types.ts`); nothing where it is not of the shape. */
function locatedOf(value: unknown): AutomationStudioResultStandingNoLocated | undefined {
  if (!isObject(value) || typeof value.kind !== "string" || !LOCATED_KINDS.has(value.kind) || typeof value.row !== "string") return undefined;
  for (const key of ["column", "value", "step"] as const) if (value[key] !== undefined && typeof value[key] !== "string") return undefined;
  return {
    kind: value.kind as AutomationStudioResultStandingNoLocated["kind"], row: value.row,
    ...(typeof value.column === "string" ? { column: value.column } : {}),
    ...(typeof value.value === "string" ? { value: value.value } : {}),
    ...(typeof value.step === "string" ? { step: value.step } : {})
  };
}

/** A copy of one set of conditions that left rows out only together (`./types.ts`); nothing where it is not of the shape. */
function togetherOf(value: unknown): AutomationStudioResultStandingNoTogether | undefined {
  if (!isObject(value) || typeof value.nodeId !== "string" || !strings(value.rows) || !Array.isArray(value.numbers)) return undefined;
  const numbers = value.numbers;
  if (numbers.length < 2 || !numbers.every((number) => Number.isSafeInteger(number) && (number as number) >= 1)) return undefined;
  const keptOut = value.keptOut === undefined ? undefined : automationStudioResultKeptOutRowsOf(value.keptOut);
  if (value.keptOut !== undefined && !keptOut) return undefined;
  return { nodeId: value.nodeId, numbers: [...numbers as number[]], rows: [...value.rows], ...(keptOut ? { keptOut } : {}) };
}

function conditionOf(value: unknown): AutomationStudioResultStandingNoCondition | undefined {
  if (!isObject(value) || typeof value.name !== "string" || (value.key !== undefined && typeof value.key !== "string") || (value.leftOutAlone !== undefined && !strings(value.leftOutAlone))) return undefined;
  if ((value.nodeId !== undefined && typeof value.nodeId !== "string") || (value.number !== undefined && !Number.isSafeInteger(value.number))) return undefined;
  // Its standing as an exclusion the request states (t687): words, or rows, each a list of text.
  if ((value.excludes !== undefined && !strings(value.excludes)) || (value.askedFor !== undefined && !strings(value.askedFor))) return undefined;
  const keptOut = value.keptOut === undefined ? undefined : automationStudioResultKeptOutRowsOf(value.keptOut);
  if (value.keptOut !== undefined && !keptOut) return undefined;
  return {
    name: value.name,
    ...(value.key !== undefined ? { key: value.key } : {}),
    ...(value.leftOutAlone !== undefined ? { leftOutAlone: [...value.leftOutAlone] } : {}),
    ...(typeof value.nodeId === "string" ? { nodeId: value.nodeId } : {}),
    ...(typeof value.number === "number" ? { number: value.number } : {}),
    ...(keptOut ? { keptOut } : {}),
    ...(value.excludes?.length ? { excludes: [...value.excludes] } : {}),
    ...(value.askedFor?.length ? { askedFor: [...value.askedFor] } : {})
  };
}

/** A copy of rows a condition kept out, where every one has the shape (`./types.ts`); nothing otherwise. */
export function automationStudioResultKeptOutRowsOf(value: unknown): AutomationStudioResultStandingNoKeptOutRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.map((row): AutomationStudioResultStandingNoKeptOutRow | undefined => {
    if (!isObject(row) || typeof row.label !== "string" || (row.by !== "also_in_result" && row.by !== "request_words") || (row.texts !== undefined && !strings(row.texts))) return undefined;
    return { label: row.label, by: row.by, ...(row.texts !== undefined ? { texts: [...row.texts] } : {}) };
  });
  return rows.every((row) => row !== undefined) ? rows as AutomationStudioResultStandingNoKeptOutRow[] : undefined;
}

function callOf(value: unknown): AutomationStudioResultStandingNoCall | undefined {
  if (!isObject(value) || (value.call !== 1 && value.call !== 2) || (value.drops !== undefined && !strings(value.drops))) return undefined;
  return { call: value.call, ...(value.drops !== undefined ? { drops: [...value.drops] } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> & { stored?: unknown; storedWhole?: unknown; conditions?: unknown; standing?: unknown; upheldKind?: unknown; together?: unknown; source?: unknown; located?: unknown } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
