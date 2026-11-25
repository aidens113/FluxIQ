// How the model edits the draft, instead of composing a final answer.
//
// The failure this replaces. A completed result the caller refuses used to be
// fed back as issue codes alone, and the model was asked again with its own
// previous answer absent from the request -- so the only thing it could do was
// write the whole answer again from memory. A live build authored the right
// acting steps, had each one refused for a handle it had invented, and
// completed again with those steps deleted and the wrong answer in their
// place. Re-emission is not a correction; it is a second first draft.
//
// An amendment names one step and says one thing about it, so a correction
// costs the model a sentence rather than the whole result. The framework
// drafts the Flow from the calls that worked (`../compose/`), and the model
// edits it with seven edits (`./edits/`):
//
//   keep      -- put back a step the framework left out; on a step in the
//                Flow, pin it there (the framework never decides it again).
//                `act` says which instructed act it does, and only a step
//                that changes something does one (`act_on_a_read`).
//   drop      -- take this step out of the Flow.
//   result    -- this read holds the answer.
//   repeat    -- do this through `through`, once per row `over` produced,
//                or while the step `while` names keeps succeeding.
//   unrepeat  -- take the repeat off this step, and nothing else.
//   bind      -- this step's value comes from somewhere at run time: lift
//                the parameters `input` names into bindings, the run that
//                worked kept as its `instance` (design t252, D2).
//   rerun     -- do it again with a corrected argument, in its place.
//
// A step joins the Flow by running it: nothing here puts in a step that did
// not run, and nothing moves a step, since the Flow runs in the order its steps
// ran.
//
// **The attempt a rerun replaced is not a step to amend.** It stays listed at
// the end of the draft as the receipt of what was replaced, linked to its rerun
// (`../step.ts`, `replacedBy`). Every amendment naming it changes nothing and is
// refused naming the step that replaced it, so the model changes that one: live
// run `run-musp474o-e0ed7432` reran its withdrawn listing three times with the
// where its rerun already held (`./replaced-attempt.ts`).
//
// A `repeat` names other steps by the numbers the model already reads, and
// leaves every node, port and edge for Core to derive (`../routing.ts`). A
// repeat with nothing beside it means the commonest thing -- the list is the
// step before, the span is this step alone -- so the model writes a field only
// when it means something other than that (`./route.ts`).
//
// **Every step number in one decision names the step as the draft entry the
// model was shown numbered it** (`./shown-numbering.ts`). A repeat the decision
// writes is checked once its last amendment is read (`./repeat-revalidation.ts`),
// and the refusal carries `over` and `through` so its telling can write both
// (`../../../llm/draft-amendment-feedback/index.ts`).
//
// `settings` rides alongside any of them, because "keep this step, but with
// this wait condition" is one thought and should not cost two calls; it never
// rewrites what the step ran with (`./settings-rewrite-run.ts`).
//
// `bind` is how a step the model ran becomes general without running it again:
// a value the person gave becomes a Flow input, and a value of the row a
// repeat is on becomes that row's field (`../binding-forms.ts`, `./bind.ts`). It
// lifts an argument the step already has and never invents one, so the run that
// worked stays evidence for the step it now is. What it lifts is a value a step
// typed, or a read's condition: a press's control or option is never bound
// (`bind_new_key`, `control`).
//
// `place`, beside `keep`, says which places on the route the person named the
// step is on (`../route-places/`, D phase 2). It is a statement about the plan,
// never proof; it replaces only that step's own places, and one that changes
// nothing is `already_so`.
//
// `rerun` is the one edit this directory does not carry out. It has to
// *execute* something, and executing is the loop's job rather than the draft's:
// the loop runs the step's action again with the new argument and the run takes
// the old step's place (`../../../llm/evidence-loop/rerun/`). It is declared here
// because it is an edit to the draft in the model's eyes and has to be written
// in the same grammar as the others.
//
// **One shape, two required fields.** The model is asked for the smallest thing
// that can carry the meaning: a step number and a word (`./edits/schema.ts`).
// Everything else about the step -- what it did, what it was given, what state
// it produced -- Core already holds and never asks for again.
export * from "./act-id.ts";
export * from "./apply.ts";
export * from "./edits/index.ts";
export * from "./landed-out.ts";
export * from "./replaced-attempt.ts";
export * from "./said-numbers.ts";
export * from "./settings-rewrite-run.ts";
export * from "./types.ts";
