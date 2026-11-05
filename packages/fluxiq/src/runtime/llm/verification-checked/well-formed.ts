// The cited cells of a verification's diagnosis Core can read (t810,
// `./schema.ts`): an object with no key but row, column and value, each a
// non-blank string, of any length. A malformed entry is dropped, and none is dropped for its
// number or length; each kept one is rebuilt key by key, so
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
    const cell = wellFormed(entry);
    if (cell) kept.push(cell);
    else dropped.push(index);
  });
  return { kept, dropped };
}

function wellFormed(entry: unknown): AutomationStudioLlmVerificationChecked | undefined {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return undefined;
  const record = entry as Record<string, unknown>;
  if (Object.keys(record).some((key) => !KEYS.includes(key))) return undefined;
  if (!nonBlankText(record.row) || !nonBlankText(record.column) || !nonBlankText(record.value)) return undefined;
  return { row: record.row, column: record.column, value: record.value };
}

function nonBlankText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
