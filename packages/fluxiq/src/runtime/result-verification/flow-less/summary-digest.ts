// The digest a completion is compared by. A judge's no or unsure is told back to
// the model, and a completion over the same evidence is refused without another
// call (design, "Judged once on a digest"): new evidence is what it needs.
//
// So only what the judge would be shown counts. Rows are read by their declared
// columns, because a read mints fresh handles on a row each time, and a row read
// again is the same evidence. Row and act order count: both are evidence.

import { createHash } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowLessSummary } from "./types.ts";

/** Same evidence, same digest, whatever order any object's keys were written in. */
export function automationStudioFlowLessSummaryDigest(summary: AutomationStudioFlowLessSummary): string {
  const evidence = summary.rows ? { ...summary, rows: { ...summary.rows, rows: summary.rows.rows.map((row) => declared(row, summary.rows?.columns ?? [])) } } : summary;
  return `sha256:${createHash("sha256").update(canonicalJson(evidence)).digest("hex")}`;
}

function declared(row: JsonObject, columns: readonly { id: string }[]): JsonObject {
  if (columns.length === 0) return row;
  return Object.fromEntries(columns.filter((column) => Object.hasOwn(row, column.id)).map((column) => [column.id, row[column.id]!]));
}

/** Copied from `../../llm/repeat-policy.ts`, whose own is private; a member that is `undefined` is no member. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const members = Object.entries(value).filter(([, member]) => member !== undefined).sort(([one], [two]) => (one < two ? -1 : one > two ? 1 : 0));
    return `{${members.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
