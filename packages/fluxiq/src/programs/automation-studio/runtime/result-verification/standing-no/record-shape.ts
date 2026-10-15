// Core's record of a no, read back from whatever carried it (t633, t641): a
// trial's result hands it to a gate as any value a port answered, so a value
// not of the record's shape is no record. Moved here from `./memory.ts` so the
// gate's kept conditions (`./kept-conditions.ts`) read a record the same way.

import type { AutomationStudioResultStandingNoCall, AutomationStudioResultStandingNoCondition, AutomationStudioResultStandingNoKeptOutRow, AutomationStudioResultStandingNoRecord } from "./types.ts";

/** A copy of `value` where it has the record's shape (`./types.ts`); nothing otherwise. */
export function automationStudioResultStandingNoRecordOf(value: unknown): AutomationStudioResultStandingNoRecord | undefined {
  if (!isObject(value) || !strings(value.stored) || typeof value.storedWhole !== "boolean" || !Array.isArray(value.conditions) || !Array.isArray(value.standing)) return undefined;
  if (value.upheldKind !== undefined && !strings(value.upheldKind)) return undefined;
  const conditions = value.conditions.map(conditionOf);
  const standing = value.standing.map(callOf);
  if (conditions.some((condition) => !condition) || standing.some((call) => !call)) return undefined;
  return {
    stored: [...value.stored],
    storedWhole: value.storedWhole,
    conditions: conditions as AutomationStudioResultStandingNoCondition[],
    ...(value.upheldKind?.length ? { upheldKind: [...value.upheldKind] } : {}),
    standing: standing as AutomationStudioResultStandingNoCall[]
  };
}

function conditionOf(value: unknown): AutomationStudioResultStandingNoCondition | undefined {
  if (!isObject(value) || typeof value.name !== "string" || (value.key !== undefined && typeof value.key !== "string") || (value.leftOutAlone !== undefined && !strings(value.leftOutAlone))) return undefined;
  if ((value.nodeId !== undefined && typeof value.nodeId !== "string") || (value.number !== undefined && !Number.isSafeInteger(value.number))) return undefined;
  const keptOut = value.keptOut === undefined ? undefined : automationStudioResultKeptOutRowsOf(value.keptOut);
  if (value.keptOut !== undefined && !keptOut) return undefined;
  return {
    name: value.name,
    ...(value.key !== undefined ? { key: value.key } : {}),
    ...(value.leftOutAlone !== undefined ? { leftOutAlone: [...value.leftOutAlone] } : {}),
    ...(typeof value.nodeId === "string" ? { nodeId: value.nodeId } : {}),
    ...(typeof value.number === "number" ? { number: value.number } : {}),
    ...(keptOut ? { keptOut } : {})
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

function isObject(value: unknown): value is Record<string, unknown> & { stored?: unknown; storedWhole?: unknown; conditions?: unknown; standing?: unknown; upheldKind?: unknown } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
