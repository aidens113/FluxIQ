import type { SubflowCard, SubflowRunOutcome } from "../types.ts";

const ROW = (count: number): string => `${count} ${count === 1 ? "row" : "rows"}`;

/** One value it handed back, as a person reads it. */
export function valueWords(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "nothing";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${valueWords(item)}`).join(", ");
}

/** What a run handed back, one "Name: value" line each, by the names the card gives its outputs. */
export function handedBackLines(outcome: SubflowRunOutcome, card: SubflowCard): string[] {
  return Object.entries(outcome.outputs).map(([id, value]) => `${card.outputs.find((output) => output.id === id)?.name ?? "Result"}: ${valueWords(value)}`);
}

/**
 * A run in honest words, never a failed ending and never a tick: it finished, or it stopped, and where.
 * Nothing here says it worked, because a run has no check in the library.
 */
export function runOutcomeWords(outcome: SubflowRunOutcome): string {
  if (outcome.status === "succeeded") return outcome.rowCount > 0 ? `It finished and saved ${ROW(outcome.rowCount)}.` : "It finished.";
  if (outcome.stoppedAt !== undefined) return `It stopped at ${outcome.stoppedAt.stepLabel}: ${outcome.stoppedAt.reason}`;
  if (outcome.status === "cancelled") return "It was cancelled before it finished.";
  return "It stopped before it finished.";
}
