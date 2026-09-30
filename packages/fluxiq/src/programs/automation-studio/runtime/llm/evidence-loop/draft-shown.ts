// What the model was shown of its own draft, measured from the entry it was
// shown -- so a run's record answers "did it see the whole thing?" as a lookup.
//
// Since 2026-09-30 the answer is always yes: the draft entry lists every step
// with the argument it ran with and the full guidance, whatever its size
// (`../../flow-draft/entry.ts`). It used to be held to a byte budget and shrank
// to fit -- packed rows, shorter guidance, arguments withheld, oldest steps
// counted rather than listed -- and this module existed to say what that cost.
// The fields that described the shrinking stay on the type because recorded
// rows from before then carry them; nothing produces them now.
//
// Codes and integers only, on the same rule as every other member of the row:
// nothing here is a value from a page -- the step lines are read for their
// *shape*, never for their content.

import type { JsonValue } from "../../../../../core/index.ts";

/** What one decision was shown of the draft. */
export type AutomationStudioLlmEvidenceLoopDraftShown = {
  /** The bytes of the entry's value. */
  bytes: number;
  /**
   * What the entry was allowed. The draft has no budget any more and is shown
   * whole, so this equals `bytes`; it stays because recorded rows carry it.
   */
  budget: number;
  /** Step lines the entry listed: every step of the draft. */
  steps: number;
  /** The bytes of guidance the entry carried. */
  instructionBytes: number;
  /** Rows recorded before 2026-09-30 only: older steps counted rather than listed. */
  unlisted?: number;
  /** Rows recorded before 2026-09-30 only: listed steps whose argument was dropped to fit. */
  withoutInput?: number;
  /** Rows recorded before 2026-09-30 only: listed steps whose argument was too large to carry. */
  inputTooLarge?: number;
  /** Rows recorded before 2026-09-30 only: the entry went over its budget. */
  overBudget?: true;
  /** Rows recorded before 2026-09-30 only: the budget was under the draft floor. */
  budgetBelowFloor?: true;
};

/** Measure the draft entry a decision was shown. */
export function automationStudioLlmEvidenceLoopDraftShown(input: { value: JsonValue }): AutomationStudioLlmEvidenceLoopDraftShown {
  const entry = isRecord(input.value) ? input.value : {};
  if (entry.format !== undefined || entry.fields !== undefined) malformedDraft();
  const lines = Array.isArray(entry.steps) ? entry.steps : [];
  if (lines.some((line) => !isRecord(line))) malformedDraft();
  const bytes = Buffer.byteLength(JSON.stringify(input.value), "utf8");
  return {
    bytes,
    budget: bytes,
    steps: lines.length,
    instructionBytes: typeof entry.instruction === "string" ? Buffer.byteLength(entry.instruction, "utf8") : 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function malformedDraft(): never {
  throw new Error("Cannot measure a draft entry that is not the whole object-form draft");
}
