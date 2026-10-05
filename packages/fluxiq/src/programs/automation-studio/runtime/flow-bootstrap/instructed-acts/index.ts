// Barrel for the instructed-acts check: whether every lasting act the
// instruction asks for has a step in the draft that does it.
//
// `instruction-acts.ts` is published beside the check because the reading of
// an instruction's acts is also what a resumed build is told it still owes
// (`../incomplete-draft/`); it is the one reading, so nothing reads acts twice.
//
// `instruction-choices.ts` and `choice-evidence.ts` are deliberately absent:
// an act's choices travel on the act (`requires`), and whether a step's input
// makes one is how the check reaches its verdict, not what it offers. So is
// `act-consequence.ts`: the class an act's verb names travels on the act.
//
// `span.ts` is published because the amendment that answers `span_stops_short`
// (`../../llm/harness-options/repeat-suggestion.ts`) finds the span the same way.
//
// `standing.ts` is the one loop the check and the checklist share, trying every
// step named for an act; `step-fault.ts` is the rule it holds each step to.
// The rules that loop applies after it -- `object-binding.ts` (what the step
// acted on, read against each act's object from `act-object.ts`) and
// `quantity-fault.ts` (how many) -- are absent for the reason the choice
// evidence is: they are how the loop reaches its verdict, not what it offers.
//
// `choice-order.ts` is published because the choice made after its act's step
// travels on the verdict and the checklist as information, typed by it.
//
// `permission.ts` is the one rule a completion is still refused for: an act
// whose verb names a class a person is asked about needs a step declaring it.
// The check and the checklist are information beside the test and its judge.
export * from "./check.ts";
export * from "./checklist.ts";
export * from "./choice-order.ts";
export * from "./contracts.ts";
export * from "./instruction-acts.ts";
export * from "./permission.ts";
export * from "./span.ts";
export * from "./standing.ts";
export * from "./step-fault.ts";
export * from "./claim-doubt.ts";
export * from "./kind-words.ts";
