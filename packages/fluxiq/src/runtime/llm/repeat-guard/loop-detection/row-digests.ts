// The rows an answer kept, as digests: enough to say whether a repeated read
// brought new rows or a new row identity, and nothing that could show a row.
//
// Read from the two places the loop's own check reads them
// (`../../node-tools/rerun-checked-rows.ts`): Core's `readRows.rows`, else the
// list under the bound domain's declared `holder.member` (`readRowsKey`).
// Evidence the domain declared, never words, so a call whose answer names no
// rows simply has none.

import type { JsonValue } from "../../../../core/index.ts";
import { automationStudioLlmLoopDigest } from "./meaningful-input.ts";

const READ_ROWS = "readRows";

const isObject = (value: unknown): value is Record<string, JsonValue> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A digest per row the answer kept; nothing when it names no rows. */
export function automationStudioLlmLoopRowDigests(answer: JsonValue, readRowsKey?: string): string[] | undefined {
  if (!isObject(answer)) return undefined;
  const named = answer[READ_ROWS];
  if (isObject(named) && Array.isArray(named.rows)) return named.rows.map(automationStudioLlmLoopDigest);
  const [holder, member, ...more] = readRowsKey?.split(".") ?? [];
  if (!holder || !member || more.length) return undefined;
  const held = answer[holder];
  const rows = isObject(held) ? held[member] : undefined;
  return Array.isArray(rows) ? rows.map(automationStudioLlmLoopDigest) : undefined;
}
