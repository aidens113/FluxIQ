// The reduced edit grammar, for the Flow the framework drafts from the calls that worked
// (user, 2026-11-25: "Drafting the flow automatically will help in many situations, as long as the
// model is able and encouraged to edit it for more efficient flows"). Six edits: `keep` puts back
// a step the framework left out, `drop` takes one out, `result` names the read that holds the
// answer, `repeat` and `unrepeat` loop the steps done again per item or page, `bind` makes a typed
// value a parameter. Anything else is refused `not_an_edit`. Every applied ruling deletes `drafted`
// from the steps it rules on, so the model's word stands from then on (`../apply.ts`).
export * from "./changes.ts";
export * from "./is-edit.ts";
export * from "./left-out.ts";
export * from "./put-in-over.ts";
export * from "./result.ts";
export * from "./schema.ts";
