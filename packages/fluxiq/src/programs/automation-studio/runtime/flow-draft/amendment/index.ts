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
// costs the model a sentence rather than the whole result. Twelve changes: six
// about whether a step is in the Flow at all, five about when it runs, and one
// about what it runs with (`./changes.ts`).
//
//   add          -- put this step I ran into the Flow (at `to`, when given).
//                   Since 2026-09-30 a step the model runs is evidence, not a
//                   step of the Flow, until the model adds it -- here, or with
//                   `add` on the call itself (`../../llm/evidence-loop-decision.ts`).
//                   `act` says which instructed act it does, and only a step
//                   that changes something does one (`act_on_a_read`).
//   drop         -- this step should not be in the result at all.
//   exploratory  -- I did this to look around; do not keep it.
//   keep         -- undo any of the above, and make the step unconditional
//                   again: it clears optional, only_if and on_failed, never a
//                   repeat, and nothing at all when it carries `act`.
//   reorder      -- this step belongs at another position.
//   rerun        -- do it again with a corrected argument, replacing it.
//
// **The attempt a rerun replaced is not a step to amend.** It stays listed at
// the end of the draft as the receipt of what was replaced, linked to its rerun
// (`../step.ts`, `replacedBy`). Every amendment naming it changes nothing and is
// refused naming the step that replaced it, so the model changes that one: live
// run `run-musp474o-e0ed7432` reran its withdrawn listing three times with the
// where its rerun already held, and an `add` would have put the old listing
// back in the Flow beside its own rerun (`./replaced-attempt.ts`).
//
//   optional     -- the Flow carries on when this step fails.
//   only_if      -- run this only when the step before it succeeded.
//   on_failed    -- when this fails, run `to` instead, then carry on.
//   repeat       -- do this through `through`, once per row `over` produced,
//                   or while `over` keeps holding.
//   unrepeat     -- take the repeat off this step, and nothing else.
//
//   bind         -- this step's value comes from somewhere at run time: lift
//                   the parameters `input` names into bindings, the run that
//                   worked kept as its `instance` (design t252, D2).
//
// The routing words are `../routing.ts`, and they exist because a draft that can
// only say "and then" produces a Flow that always does everything: a build that
// dismissed a consent banner shipped a Flow that fails on every page showing
// none. Each is one word about one step, names other steps by the numbers the
// model already reads, and leaves every node, port and edge for Core to derive.
// A routing word with nothing beside it means the commonest thing -- the check
// is the step before, the span is this step alone -- so the model writes a
// field only when it means something other than that (`./route.ts`).
//
// **Every step number in one decision names the step as the draft entry the
// model was shown numbered it** (`./shown-numbering.ts`). Until t195 w45 a
// `reorder` renumbered at once and the next amendment of the decision was read
// against the new numbers, so live run `run-musr9pv3-f4bf6256`'s
// `15 reorder to 14, 15 repeat over 14` (0056, about its Confirm and its
// listing) put the repeat on the listing, over the Confirm. Every number --
// `step`, `to`, `check`, `through`, `over` -- is now looked up in the draft as
// shown; `to` is the place the step shown there holds (before it moving up,
// after it moving down, `./move.ts`). A listing after its act (`9 repeat over
// 18`, live run `run-murz83zy-5030820f`, R8) is moved with `18 reorder to 9`
// beside `9 repeat over 18`, and the refusal carries `over` and `through` so its
// telling can write both (`../../llm/draft-amendment-feedback.ts`). A repeat the
// decision writes is checked once its moves are done, so the two may come in
// either order. The draft the model reads next is numbered 1..n in the order
// the steps then stand.
//
// **A move revalidates every repeat** (`./repeat-revalidation.ts`). A repeat
// names steps by id (`../routing.ts`), but a reorder can leave its listing
// after it, or its span's end before its start: run musr9pv3's stray repeat
// stood from 0056 on. After a decision that moved a step, every repeat that
// cannot run is taken off and the answer says which, over which step, and why
// (`repeat_taken_off`).
//
// `settings` rides alongside any of them, because "keep this step, but with
// this wait condition" is one thought and should not cost two calls.
//
// `bind` is how a step the model ran becomes general without running it again:
// a value the person gave becomes a Flow input, and a value of the row a
// repeat is on becomes that row's field (`../binding-forms.ts`, `./bind.ts`). It
// lifts an argument the step already has and never invents one, so the run that
// worked stays evidence for the step it now is. What it lifts is a value a step
// typed, or a read's condition: a press's control or option is never bound
// (`bind_new_key`, `control`).
//
// `rerun` is the one amendment this directory does not carry out. It has to
// *execute* something, and executing is the loop's job rather than the draft's:
// the loop runs the step's action again with the new argument, appends what came
// back as a new step, and drops the old one. It is declared here because it is an
// edit to the draft in the model's eyes and has to be written in the same grammar
// as the others -- a model that must choose between "edit the draft" and "call a
// tool" to correct one parameter is choosing between two vocabularies again.
//
// **One shape, two required fields.** The model is asked for the smallest thing
// that can carry the meaning: a step number and a word (`./schema.ts`).
// Everything else about the step -- what it did, what it was given, what state
// it produced -- Core already holds and never asks for again.
export * from "./act-id.ts";
export * from "./apply.ts";
export * from "./changes.ts";
export * from "./replaced-attempt.ts";
export * from "./schema.ts";
export * from "./types.ts";
