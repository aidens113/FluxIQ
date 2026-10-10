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
//
// Since t388 the block-level statements of the state-aware grammar live here
// too: a part a step calls (`./called-parts.ts`), a block's other entries and
// its checkpoints (`./entry-points.ts`), a handler (`./handler-blocks.ts`), and
// the page facts all three test (`./fact-condition.ts`). Since t413 a step's
// own `done when:` too, which becomes its node's expected state
// (`./step-done-when.ts`).
export * from "./called-parts.ts";
export * from "./entry-points.ts";
export * from "./fact-condition.ts";
export * from "./flow-requires.ts";
export * from "./guarded-steps.ts";
export * from "./handler-blocks.ts";
export * from "./repeat-bound.ts";
export * from "./repeat-pace.ts";
export * from "./script-spans.ts";
export * from "./step-done-when.ts";
