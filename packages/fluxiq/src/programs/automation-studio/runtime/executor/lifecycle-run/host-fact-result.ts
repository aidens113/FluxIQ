// One host fact answer as Core keeps it (state-aware recovery plan, C9, C11).
//
// This module owns the mapping from what a host's `factEvaluator` returned
// for one condition to `AutomationStudioFactConditionResult`. Core keeps a
// bounded reference to the evidence, never the evidence: a host's evidence may
// quote the page, so it is reduced to a digest, and a host's own reference is
// kept only when it is a short token of plain characters.

import type { AutomationStudioFactConditionResult, AutomationStudioFactTruth } from "../lifecycle/index.ts";

/** A host reference Core keeps as it is: a short token, never prose or page text. */
const HOST_REFERENCE = /^[A-Za-z0-9._:/#-]{1,120}$/u;

/** How deep a digest reads evidence; deeper parts digest as their depth marker. */
const DIGEST_DEPTH = 6;

const TRUTHS: ReadonlySet<string> = new Set<AutomationStudioFactTruth>(["true", "false", "unknown"]);

/**
 * What Core keeps of one host answer:
 * - `truth`: the answer's `result` when it is `true`, `false` or `unknown`;
 *   anything else is `unknown` with the reference `core:unreadable_answer`;
 * - `capturedAt`: the host's time when it is a finite, non-negative number,
 *   else `now`;
 * - `evidenceRef`: the host's `evidenceRef` when it is a short plain token,
 *   else `evidence:<digest>` of its `evidence`, else none.
 */
export function automationStudioHostFactConditionResult(answer: unknown, now: number): AutomationStudioFactConditionResult {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return { truth: "unknown", evidenceRef: "core:unreadable_answer", capturedAt: now };
  const record = answer as Record<string, unknown>;
  const truth = typeof record.result === "string" && TRUTHS.has(record.result) ? (record.result as AutomationStudioFactTruth) : undefined;
  const capturedAt = typeof record.capturedAt === "number" && Number.isFinite(record.capturedAt) && record.capturedAt >= 0 ? record.capturedAt : now;
  if (!truth) return { truth: "unknown", evidenceRef: "core:unreadable_answer", capturedAt };
  const evidenceRef = typeof record.evidenceRef === "string" && HOST_REFERENCE.test(record.evidenceRef)
    ? record.evidenceRef
    : record.evidence === undefined ? undefined : `evidence:${digest(canonical(record.evidence, 0))}`;
  return evidenceRef === undefined ? { truth, capturedAt } : { truth, evidenceRef, capturedAt };
}

/** Canonical text of a value: object keys sorted, `undefined` members left out, bounded in depth. */
function canonical(value: unknown, depth: number): string {
  if (depth > DIGEST_DEPTH) return "\"<deep>\"";
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry, depth + 1)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key], depth + 1)}`).join(",")}}`;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return JSON.stringify(value);
  return `"<${typeof value}>"`;
}

/** Two FNV-1a passes with different offsets: 64 bits, as `../lifecycle/incident.ts` digests evidence. */
function digest(text: string): string {
  return `${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x01000193)}`;
}

function fnv1a(text: string, offset: number): string {
  let hash = offset >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
