// What the model was shown of its own draft, measured from the entry it was
// shown -- so a run's record answers "did it see the whole thing?" as a lookup.
//
// The loop reserves `draftBytes` for the draft entry and never learns what
// became of them. The entry first packs complete step rows, then shrinks itself
// to fit: repeated names and guidance go before arguments, and only then are the
// oldest steps counted instead of listed (`../../flow-draft/entry.ts`). All of that
// happened in silence. On 2026-09-26
// a budget beneath the entry's own floor returned *nothing*, the caller filtered
// the nothing out of what it shows -- `[draftEntry, budgetEntry].filter(...)` --
// and the model was asked to decide, including to amend, with no record anywhere
// of what it had been shown: no refusal, no row, no log line. The defect sat on
// `dev` visible only as a failing unit test, and settling whether a live run had
// been affected meant rebuilding twelve steps by hand from the trace.
//
// So the entry is measured as it goes out, and the numbers ride the row the
// decision records. Codes and integers only, on the same rule as every other
// member of that row: `bytes` is the size of what was shown, and the rest says
// what shrinking it cost. Nothing here is a value from a page -- the step lines
// are read for their *shape*, never for their content.
//
// **This is the only thing anywhere that reads the entry back.** The ordinary
// entry is prose and object field names; the packed entry therefore declares a
// closed format and its columns. This reader accepts that format only when the
// declaration and every row are exact. A producer change cannot quietly turn
// omissions into zero: an unknown packed shape fails closed, and
// `./tests/draft-shown.test.ts` binds the reader to real producer entries.

import type { JsonValue } from "../../../../../core/index.ts";

const DRAFT_STEP_ROW_FORMAT = "step_rows_v1";
const DRAFT_STEP_ROW_FIELDS = [
  "step",
  "actionId",
  "input",
  "resultCode",
  "changed",
  "disposition",
  "inResult",
  "replayed",
  "runs",
  "settings"
] as const;

/** What one decision was shown of the draft, and what showing it cost. */
export type AutomationStudioLlmEvidenceLoopDraftShown = {
  /**
   * The bytes of the entry's value, as the entry itself counts them -- so this
   * and `budget` are the two sides of one comparison.
   */
  bytes: number;
  /** What the entry was allowed: `draftBytes` from the resolved limits. */
  budget: number;
  /** Step lines the entry listed. */
  steps: number;
  /**
   * The bytes of guidance the entry carried.
   *
   * The draft's instruction has three lengths and the entry picks the longest
   * that fits, so this says which telling the model got: the full one, the one
   * that keeps every rule without the elaboration, or the two sentences it
   * cannot act without. It is the figure that moves when the guidance is
   * lengthened, which is what turned a working entry into nothing at all.
   */
  instructionBytes: number;
  /** Older steps counted rather than listed. Absent where every step was listed. */
  unlisted?: number;
  /** Listed steps whose argument was dropped to make the entry fit. */
  withoutInput?: number;
  /** Listed steps whose argument was there and too large to carry. */
  inputTooLarge?: number;
  /**
   * The entry went over its budget, which is the floor entry going out anyway.
   *
   * The draft is never given back as nothing, so when not one rung of the ladder
   * fits, the least entry -- the newest step, no argument, the shortest telling
   * -- is shown over budget. That is the right trade and it is not free: it eats
   * into what the window may show, so it is stated rather than absorbed.
   */
  overBudget?: true;
  /**
   * The budget was under the floor a draft needs
   * (`AUTOMATION_STUDIO_LLM_EVIDENCE_MIN_DRAFT_BYTES`), so this build's drafts
   * are told in the shortest words whatever their length.
   *
   * It is a property of the configuration rather than of this entry, and it is
   * carried on every row all the same: a row is what a reader of the run has,
   * and a misconfiguration nobody can see from the record is the defect this
   * whole module exists because of.
   */
  budgetBelowFloor?: true;
};

/**
 * Measure the draft entry a decision was shown.
 *
 * `minBytes` is the floor a draft budget must clear, passed in rather than
 * imported: the module that resolves the limits reads the loop's contract out of
 * this directory, so reading it back from here would close a cycle.
 */
export function automationStudioLlmEvidenceLoopDraftShown(input: {
  value: JsonValue;
  budget: number;
  minBytes: number;
}): AutomationStudioLlmEvidenceLoopDraftShown {
  const entry = isRecord(input.value) ? input.value : {};
  const lines = Array.isArray(entry.steps) ? entry.steps : [];
  let withoutInput = 0;
  let inputTooLarge = 0;
  if (entry.format === undefined) {
    if (entry.fields !== undefined || lines.some(Array.isArray)) malformedPackedDraft();
    for (const line of lines) {
      if (!isRecord(line)) continue;
      // A step always carries the argument it ran with, so a line without one
      // is a line the entry held back -- either because the argument was too
      // large to show, which the line says, or to make room, which it does not.
      if (line.inputTooLarge === true) inputTooLarge += 1;
      else if (line.input === undefined) withoutInput += 1;
    }
  } else {
    if (entry.format !== DRAFT_STEP_ROW_FORMAT
      || !fieldsMatch(entry.fields)
      || !Array.isArray(entry.steps)
      || !entry.steps.every(isDraftStepRow)) malformedPackedDraft();
    for (const line of entry.steps) {
      if (line[2] === null) withoutInput += 1;
    }
  }
  const unlisted = typeof entry.unlisted === "number" ? entry.unlisted : 0;
  const bytes = Buffer.byteLength(JSON.stringify(input.value), "utf8");
  return {
    bytes,
    budget: input.budget,
    steps: lines.length,
    instructionBytes: typeof entry.instruction === "string" ? Buffer.byteLength(entry.instruction, "utf8") : 0,
    ...(unlisted > 0 ? { unlisted } : {}),
    ...(withoutInput > 0 ? { withoutInput } : {}),
    ...(inputTooLarge > 0 ? { inputTooLarge } : {}),
    ...(bytes > input.budget ? { overBudget: true } as const : {}),
    ...(input.budget < input.minBytes ? { budgetBelowFloor: true } as const : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldsMatch(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === DRAFT_STEP_ROW_FIELDS.length
    && value.every((field, index) => field === DRAFT_STEP_ROW_FIELDS[index]);
}

/** The exact closed row emitted by `flow-draft/entry.ts`. */
function isDraftStepRow(value: unknown): value is JsonValue[] {
  if (!Array.isArray(value) || value.length < 7 || value.length > DRAFT_STEP_ROW_FIELDS.length) return false;
  return Number.isInteger(value[0])
    && (value[0] as number) > 0
    && typeof value[1] === "string"
    && (value[2] === null || isRecord(value[2]))
    && (value[3] === null || typeof value[3] === "string")
    && (value[4] === "yes" || value[4] === "no" || value[4] === "unknown")
    && (value[5] === "kept" || value[5] === "dropped" || value[5] === "exploratory")
    && typeof value[6] === "boolean"
    && (value.length < 8 || value[7] === null || typeof value[7] === "string")
    && (value.length < 9 || value[8] === null || typeof value[8] === "string")
    && (value.length < 10 || value[9] === null || isRecord(value[9]));
}

function malformedPackedDraft(): never {
  throw new Error("Cannot measure malformed or unknown packed draft shape");
}
