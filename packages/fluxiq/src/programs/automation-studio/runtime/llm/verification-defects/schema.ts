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
//
// **And an act the request asks for (t766).** A result that stores no rows --
// a Flow that only acts: saves, sends, adds to a cart -- has no row a no could
// name, so every no of it named `other` and came to unsure, and its failures
// never reached a repair. Such a no names the act instead: `act_missing`, an
// act the request asks for that no step does (`row` names what it is done to),
// or `act_wrong`, a step that did its act to the wrong thing, with the wrong
// value or with no effect the evidence shows (`step` names that step). Core
// finds each in its record of the steps the run took
// (`../../result-verification/located-defects/act-located.ts`).

/** The shape of `diagnosis.defects` a verification is offered: at most 12, each a closed kind, the row, an optional column, value and step, and the request's words, each a bounded string. */
export const AUTOMATION_STUDIO_LLM_VERIFICATION_DEFECTS_SCHEMA = {
  type: "array",
  maxItems: 12,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "row", "requestWords"],
    properties: {
      kind: { enum: ["kept_not_asked", "asked_missing", "wrong_value", "act_missing", "act_wrong", "other"] },
      row: { type: "string", minLength: 1, maxLength: 500 },
      column: { type: "string", minLength: 1, maxLength: 500 },
      value: { type: "string", minLength: 1, maxLength: 500 },
      step: { type: "string", minLength: 1, maxLength: 500 },
      requestWords: { type: "string", minLength: 1, maxLength: 500 }
    }
  }
} as const;
