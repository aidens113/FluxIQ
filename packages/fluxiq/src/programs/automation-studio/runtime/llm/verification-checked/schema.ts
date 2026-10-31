// The cells a result verification's yes cites as checked, as the output schema
// offers them (t810, framework plan P5b). A yes that says only "yes" cannot be
// told from a yes given without looking; one that lists the stored rows it
// checked, each with the cell that shows the row is asked for, can be checked
// by Core against its own record of the result
// (`../../result-verification/cited-yes/`).
//
// One source for the shape: the verification's schema offers it
// (`../deepseek/output-schema.ts`) and the reply check holds an item to it
// (`./well-formed.ts`), so the two cannot disagree on a key or a bound.

/** The shape of `diagnosis.checked` a verification is offered: at most 12, each a stored row's label, a column and the cell's value, each a bounded string. */
export const AUTOMATION_STUDIO_LLM_VERIFICATION_CHECKED_SCHEMA = {
  type: "array",
  maxItems: 12,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["row", "column", "value"],
    properties: {
      row: { type: "string", minLength: 1, maxLength: 500 },
      column: { type: "string", minLength: 1, maxLength: 500 },
      value: { type: "string", minLength: 1, maxLength: 500 }
    }
  }
} as const;
