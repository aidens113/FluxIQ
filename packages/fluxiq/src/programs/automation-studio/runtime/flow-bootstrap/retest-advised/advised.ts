import type { JsonObject } from "../../../../../core/index.ts";

/**
 * Whether Core's record contradicts what kept an unsure from a yes
 * (`../candidate/trial-gate.ts`, t641): the no's reading wholly
 * (`unconfirmedReading.recordContradicts`, Core's field beside its label),
 * or the unsure call's doubt (`doubtContradicted`).
 * Read as fields Core set, never off the words; one judge's yes is none.
 * Exported for the subflow trial gate, which advises a re-test the same way.
 */
export function automationStudioCandidateRetestAdvised(answer: { feedback: JsonObject }): boolean {
  const reading = answer.feedback.unconfirmedReading;
  if (isJsonObject(reading) && reading.recordContradicts === "whole") return true;
  return typeof answer.feedback.doubtContradicted === "string" && answer.feedback.doubtContradicted.length > 0;
}

function isJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try { return JSON.stringify(value) !== undefined; } catch { return false; }
}
