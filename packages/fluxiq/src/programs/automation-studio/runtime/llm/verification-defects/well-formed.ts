// The defects of a verification's diagnosis Core can check, and the place of
// each it cannot (t752, `./schema.ts`).
//
// A defect is kept only as the schema offers it: an object with no key but
// kind, row, column, value, step and requestWords, a kind Core knows, an
// `act_wrong` naming its step (t766), and each text a
// non-blank string within its bound. Legacy reads drop malformed entries and keep an explicit empty account;
// current negative verification replies reject any malformed account. The legacy reply check warns
// with the dropped one's place (`../harness/provider-result.ts`). Past the
// schema's twelve, the rest are dropped the same way. Each kept defect is
// rebuilt key by key, so nothing rides in beside it. Read on the way in and
// again on the way out (`../harness/context-packet.ts`), as every key of the
// diagnosis channel is.

import type { AutomationStudioLlmVerificationDefect } from "../harness/index.ts";
import { AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA as SCHEMA } from "./schema.ts";

const KINDS: readonly unknown[] = SCHEMA.items.properties.kind.enum;
const KEYS: readonly string[] = Object.keys(SCHEMA.items.properties);

/**
 * The well-formed defects of `value`, in order, and the index of each entry
 * dropped; `dropped` holds `undefined` alone when `value` is not a list.
 */
export function automationStudioLlmWellFormedVerificationDefects(value: unknown): { kept: AutomationStudioLlmVerificationDefect[]; dropped: Array<number | undefined> } {
  if (!Array.isArray(value)) return { kept: [], dropped: [undefined] };
  const kept: AutomationStudioLlmVerificationDefect[] = [];
  const dropped: number[] = [];
  value.forEach((entry: unknown, index) => {
    const defect = kept.length < SCHEMA.maxItems ? wellFormed(entry) : undefined;
    if (defect) kept.push(defect);
    else dropped.push(index);
  });
  return { kept, dropped };
}

function wellFormed(entry: unknown): AutomationStudioLlmVerificationDefect | undefined {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
  const record = entry as Record<string, unknown>;
  if (Object.keys(record).some((key) => !KEYS.includes(key))) return undefined;
  if (!KINDS.includes(record.kind) || !boundedText(record.row) || !boundedText(record.requestWords)) return undefined;
  if (record.column !== undefined && !boundedText(record.column)) return undefined;
  if (record.value !== undefined && (!boundedText(record.value) || !boundedText(record.column))) return undefined;
  if (record.step !== undefined ? !boundedText(record.step) : record.kind === "act_wrong") return undefined;
  return {
    kind: record.kind as AutomationStudioLlmVerificationDefect["kind"],
    row: record.row,
    ...(record.column !== undefined ? { column: record.column as string } : {}),
    ...(record.value !== undefined ? { value: record.value as string } : {}),
    ...(record.step !== undefined ? { step: record.step as string } : {}),
    requestWords: record.requestWords
  };
}

function boundedText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= SCHEMA.items.properties.row.maxLength;
}
