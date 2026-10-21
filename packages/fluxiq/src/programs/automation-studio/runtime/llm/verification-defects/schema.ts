// The defects a result verification's no names, as the output schema offers
// them (t752). Round-5 breadth rerun: a trial stored exactly the rows asked for
// and both judges said no, one over how a condition was written -- which an
// earlier judge had advised -- and one over a claim the request's own words
// refuted. Neither named a row kept, a row missing or a wrong value, and Core
// had read nos out of prose, round after round (t607-t725). The no's grounds
// are now a list Core can find in its own record
// (`../../result-verification/agreement/`).
//
// One source for the shape: the verification's schema offers it
// (`../deepseek/output-schema.ts`) and the reply check holds a defect to it
// (`./well-formed.ts`), so the two cannot disagree on a kind or a bound.

/** The shape of `diagnosis.defects` a verification is offered: at most 12, each a closed kind, the row, an optional column and the request's words, each a bounded string. */
export const AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA = {
  type: "array",
  maxItems: 12,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "row", "requestWords"],
    properties: {
      kind: { enum: ["kept_not_asked", "asked_missing", "wrong_value", "other"] },
      row: { type: "string", minLength: 1, maxLength: 500 },
      column: { type: "string", minLength: 1, maxLength: 500 },
      value: { type: "string", minLength: 1, maxLength: 500 },
      requestWords: { type: "string", minLength: 1, maxLength: 500 }
    }
  }
} as const;
