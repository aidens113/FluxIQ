// The defects of a verification's diagnosis Core can check, and the place of
// each it cannot (t752, `./schema.ts`).
//
// A defect is kept only as the schema offers it: an object with no key but
// kind, row, column, value, step and requestWords, a kind Core knows, an
// `act_wrong` naming its step (t766), and each text a
// non-blank string, however long: neither a defect's length nor how many there are makes one malformed (t869).
//
// **An optional text written blank is not written (t1034).** Bigbox run run-mwveg5ls-0266dfe0 (step 234): a judge's no
// listed eight defects, and its `act_wrong` -- the item added to the cart -- wrote `column: ""` beside the value "added
// to cart", since no column of a table holds an act. That one entry made the whole account malformed, the current no
// was refused unread, and the judge was asked again at another $0.07. So a blank `column`, `value` or `step` is read as
// absent, as a blank summary is (`../harness/provider-result.ts`), and an act's defect (`act_missing`, `act_wrong`) may
// carry a value without a column: nothing compares it with a cell (`../../result-verification/located-defects/act-located.ts`
// reads the step and the row). A row's value still needs its column, and an `act_wrong` still needs its step. Legacy reads
// drop malformed entries and keep an explicit empty account; current negative verification replies reject any malformed
// account. The legacy reply check warns with the dropped one's place (`../harness/provider-result.ts`). Each kept defect is
// rebuilt key by key, so nothing rides in beside it. Read on the way in and
// again on the way out (`../harness/context-packet.ts`), as every key of the
// diagnosis channel is.

import type { AutomationStudioLlmVerificationDefect } from "../harness/index.ts";
import { AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA as SCHEMA } from "./schema.ts";

const KINDS: readonly unknown[] = SCHEMA.items.properties.kind.enum;
const KEYS: readonly string[] = Object.keys(SCHEMA.items.properties);
/** The optional texts of a defect: written blank, each is read as not written. */
const OPTIONAL_TEXT = ["column", "value", "step"] as const;
/** The kinds that name an act rather than a row's cell (`./schema.ts`, t766): a value there says what was done, and no column holds it. */
const ACT_KINDS: ReadonlySet<unknown> = new Set(["act_missing", "act_wrong"]);

/**
 * The well-formed defects of `value`, in order, and the index of each entry
 * dropped; `dropped` holds `undefined` alone when `value` is not a list.
 */
export function automationStudioLlmWellFormedVerificationDefects(value: unknown): { kept: AutomationStudioLlmVerificationDefect[]; dropped: Array<number | undefined> } {
  if (!Array.isArray(value)) return { kept: [], dropped: [undefined] };
  const kept: AutomationStudioLlmVerificationDefect[] = [];
  const dropped: number[] = [];
  value.forEach((entry: unknown, index) => {
    const defect = wellFormed(entry);
    if (defect) kept.push(defect);
    else dropped.push(index);
  });
  return { kept, dropped };
}

function wellFormed(entry: unknown): AutomationStudioLlmVerificationDefect | undefined {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
  const record = withBlanksUnwritten(entry as Record<string, unknown>);
  if (Object.keys(record).some((key) => !KEYS.includes(key))) return undefined;
  if (!KINDS.includes(record.kind) || !hasText(record.row) || !hasText(record.requestWords)) return undefined;
  if (record.column !== undefined && !hasText(record.column)) return undefined;
  // A value names a stored cell, so it needs its column -- except on an act's defect, which names no cell (header).
  if (record.value !== undefined && (!hasText(record.value) || (!hasText(record.column) && !ACT_KINDS.has(record.kind)))) return undefined;
  if (record.step !== undefined ? !hasText(record.step) : record.kind === "act_wrong") return undefined;
  return {
    kind: record.kind as AutomationStudioLlmVerificationDefect["kind"],
    row: record.row,
    ...(record.column !== undefined ? { column: record.column as string } : {}),
    ...(record.value !== undefined ? { value: record.value as string } : {}),
    ...(record.step !== undefined ? { step: record.step as string } : {}),
    requestWords: record.requestWords
  };
}

/** The defect with each optional text written blank read as not written: an empty `column` on a defect no column fits is the judge saying none (header). */
function withBlanksUnwritten(record: Record<string, unknown>): Record<string, unknown> {
  const read = { ...record };
  for (const key of OPTIONAL_TEXT) if (typeof read[key] === "string" && !(read[key] as string).trim()) delete read[key];
  return read;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
