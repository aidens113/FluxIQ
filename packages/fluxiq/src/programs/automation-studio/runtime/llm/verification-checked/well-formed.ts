// The cited cells of a verification's diagnosis Core can read (t810,
// `./schema.ts`): an object with no key but row, column and value, each a
// non-blank string within its bound. A malformed entry is dropped, as are the
// entries past the schema's twelve; each kept one is rebuilt key by key, so
// nothing rides in beside it. Read on the way in and again on the way out
// (`../harness/context-packet.ts`), as every key of the diagnosis channel is.

import type { AutomationStudioLlmVerificationChecked } from "../harness/index.ts";
import { AUTOMATION_STUDIO_LLM_VERIFICATION_CHECKED_SCHEMA as SCHEMA } from "./schema.ts";

const KEYS: readonly string[] = Object.keys(SCHEMA.items.properties);

/**
 * The well-formed cited cells of `value`, in order, and the index of each entry
 * dropped; `dropped` holds `undefined` alone when `value` is not a list.
 */
export function automationStudioLlmWellFormedVerificationChecked(value: unknown): { kept: AutomationStudioLlmVerificationChecked[]; dropped: Array<number | undefined> } {
  if (!Array.isArray(value)) return { kept: [], dropped: [undefined] };
  const kept: AutomationStudioLlmVerificationChecked[] = [];
  const dropped: number[] = [];
  value.forEach((entry: unknown, index) => {
    const cell = kept.length < SCHEMA.maxItems ? wellFormed(entry) : undefined;
    if (cell) kept.push(cell);
    else dropped.push(index);
  });
  return { kept, dropped };
}

function wellFormed(entry: unknown): AutomationStudioLlmVerificationChecked | undefined {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
  const record = entry as Record<string, unknown>;
  if (Object.keys(record).some((key) => !KEYS.includes(key))) return undefined;
  if (!boundedText(record.row) || !boundedText(record.column) || !boundedText(record.value)) return undefined;
  return { row: record.row, column: record.column, value: record.value };
}

function boundedText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= SCHEMA.items.properties.row.maxLength;
}
