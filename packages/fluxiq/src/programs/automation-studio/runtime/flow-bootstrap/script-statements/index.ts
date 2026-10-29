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
// (`./step-done-when.ts`). Since t423 one check that runs after the domain
// resolved each step's target, not during assembly: an optional or handler step
// that presses an interruption's offer rather than its way out
// (`./way-out-steps.ts`), which the candidate submission asks
// (`../candidate/submission.ts`). Since t498 a second check on a built plan: a
// step inside a loop whose record output replaces the run's rows on every pass
// (`./record-replace-in-repeat.ts`), which the completion check asks. Since
// t567 the lowering every other reader of a block's spans runs after: adjacent
// steps that each repeat over one listing read as one span over it
// (`./adjacent-list-repeats.ts`), which the assembler runs first. Since t741
// the one rule for a part's port names (`./part-port-name.ts`), which the
// supervisor's plan asks too.
export * from "./adjacent-list-repeats.ts";
export * from "./called-parts.ts";
export * from "./entry-points.ts";
export * from "./fact-condition.ts";
export * from "./flow-requires.ts";
export * from "./guarded-steps.ts";
export * from "./handler-blocks.ts";
// t741: a third check on a built plan, the completion check's too -- a lasting act repeated over a
// listing that sorts or limits only its saved answer. `./loop-body.ts`, which it shares with the
// replace check, is left out like `./statement-refusal.ts`: it is how both read, not what they offer.
export * from "./listing-order-in-repeat.ts";
// t785: advice, never a refusal, for a condition that lists literal values the request never says (`./listed-values-advice.ts`), given beside an accepted submission.
export * from "./listed-values-advice.ts";
export * from "./part-port-name.ts";
export * from "./record-replace-in-repeat.ts";
export * from "./repeat-bound.ts";
export * from "./repeat-pace.ts";
export * from "./script-spans.ts";
export * from "./step-done-when.ts";
// t775: a check on a submitted plan, once the domain resolved each step -- a step that flips a
// control explored as a toggle is given `ensureState`, or refused for the node that sets the state.
export * from "./toggle-idempotent.ts";
// t792: which press of a toggle a step or an exploration call on the same control is held to -- the earliest tied one.
export * from "./toggle-tie.ts";
// t792: whether two writings of a step name one control in its two states, by the words its toggle signature recorded.
export * from "./toggle-state-words.ts";
export * from "./way-out-steps.ts";
