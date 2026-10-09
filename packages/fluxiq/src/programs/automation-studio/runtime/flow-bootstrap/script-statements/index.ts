// Barrel for the statements a written step makes about how it runs, other than
// its node and values: `optional:` and `only after:` (`./guarded-steps.ts`),
// `repeat most:` (`./repeat-bound.ts`) and `repeat pace:` (`./repeat-pace.ts`),
// each lowered into the steps or fields that make it true before the steps are
// built into nodes, and the span reader they share (`./script-spans.ts`).
//
// Read only by the script assembler and its repeat router
// (`../authoring/assemble.ts`, `../authoring/draft-routing.ts`), and kept
// beside `../authoring/` rather than inside it, which the structure audit's
// depth limit forbids. It reads authoring's shapes through its barrel, as types
// only, and a step's node through the matcher the assembler passes in, so the
// two directories form no module cycle. `./statement-refusal.ts` is
// deliberately absent: it is how these refuse, not what they offer.
export * from "./guarded-steps.ts";
export * from "./repeat-bound.ts";
export * from "./repeat-pace.ts";
export * from "./script-spans.ts";
