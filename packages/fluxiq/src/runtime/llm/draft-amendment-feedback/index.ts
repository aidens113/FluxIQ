// An amendment that changed nothing, and what the model is told about it.
//
// The model edits the draft with amendments: one step number and one word
// (`../flow-draft/amendment/`). The module that applies them already computes
// a precise refusal for every amendment that changed nothing -- there is no
// step at that number, the step already says that, there is no position to move
// it to, a routing word named a step the Flow does not contain -- and until
// 2026-09-26 the loop read only how many had landed and dropped every reason on
// the floor.
//
// What that cost. `run-muhubegx-9469de5e` made nine `amend_draft` decisions.
// Seven of them changed nothing at all, five of those consecutively, and each
// time the model was asked again with no word about why its edit had not taken.
// It went on to complete with a Flow whose extraction carried one filter
// condition for a four-clause instruction and no pagination follow-through.
// Seven paid decisions were spent on edits the model had no way of knowing had
// failed, and the reason for every one of them had been computed and discarded.
//
// So a refused amendment is now told to the model before it is asked again, the
// same way a refused completion is (`./evidence-loop.ts`): one evidence entry,
// under this module's own tool id, naming each refused amendment by the step
// number the model wrote and a reason from a closed set. Codes, sentences Core
// wrote, and integers -- never a value from a page but the few a read's own call
// showed (`./repeat-guard/narrowed-nothing.ts`, t693). Nothing else is in a
// refusal: it is Core's own bookkeeping about a number.
//
// **It does not guess.** A refusal names the step the model named, and nothing
// here proposes the step it might have meant instead. A step leaves a Flow
// because the model decided it should, and an amendment the loop reinterpreted
// would be an edit -- perhaps a removal -- that nobody decided.
//
// **It does say what comes next, by number, where the draft shows it.** Live run
// 37 (`run-muq5v4zg-39182b58`) filtered its friend requests correctly as step
// 13, sent `13 repeat over 13` with no press anywhere in the draft, was told
// the rule in general (`over_not_before`), then reran step 13 unchanged three
// times (`changes_nothing`) until the round stopped -- it never pressed a
// Confirm. Both refusals were about a listing whose rows were right and a loop
// that lacked its act. So a refusal about a listing carries `next`: the press
// after it to put the repeat on, or, when there is none, that the act on one
// row it kept comes first, with the repeat to send then. Nothing is changed on
// the model's behalf; `next` is information, in the draft's own numbers.
//
// **A listing after its act is moved first.** Live run `run-murz83zy-5030820f`
// (R8) pressed Amara's Confirm as step 9 and ran the filtered listing only at
// step 18, then sent `9 repeat over 18` five decisions running and once more in
// round 1. Each refusal told it to send `{step: <act>, change: repeat, over:
// <listing>}` -- exactly what it had sent -- and `next` looked for a press
// *after* the listing and said there was none. Nothing pointed to `reorder`.
// So when the repeat was put on a working act and `over` names a listing after
// it, `next` says to move the listing to the act's place and then repeat the
// act. Every number in one decision names the step as the draft shown numbered
// it, and the draft is renumbered once, after the whole decision
// (`../flow-draft/amendment/shown-numbering.ts`, t195 w45), so `18 reorder to 9`
// goes with `9 repeat over 18`, and a `through` keeps the number shown. Until
// then a reorder renumbered at once and the telling said `10 repeat over 9`:
// live run `run-musr9pv3-f4bf6256` wrote its numbers that way and once the
// other, and a repeat landed on its listing (`15 reorder to 14, 15 repeat over 14`).
//
// **A repeat a decision's moves broke is said, not left.** That stray repeat,
// over the Confirm after the listing, stood from decision 0056 to the end of
// the round, and the model was never told. A decision that moves a step now
// takes off every repeat that can no longer run (`repeat_taken_off`,
// `../flow-draft/amendment/repeat-revalidation.ts`), and the answer says which
// step's repeat over which step was taken off, and why, in the numbers the
// model wrote and, where they changed, the ones it reads next. It is not an
// amendment of the model's that changed nothing, so it is never marked
// repeated and the answer does not call it one.
//
// **The attempt a rerun replaced names its replacement.** Live run
// `run-musp474o-e0ed7432` reran its listing at step 6 with a fixed where, was
// shown the withdrawn attempt as step 7, and reran "step 7" with the same where
// three times; each refusal said only that the argument had already run, never
// that step 6 held it, and the round stopped. A refusal about such an attempt
// carries `replacedBy` (`../flow-draft/amendment/replaced-attempt.ts`), and
// `next` says it: step 7 is the attempt step 6's rerun replaced, so change
// step 6.
//
// **Every refusal says what is still to do (live run `run-musp4h2f-72e8ed99`).**
// Round 0 bound the `target` of its size press, as the draft showed it, and was
// told to "name a parameter it already has, as the draft shows it" -- which it
// had. It then re-sent `keep 9` and `drop 10`, refused `already_in_flow` and
// `already_out` with no word of what was left, until the round stopped
// `unusable_decisions` with four acts not done. Only `act_already_named` named
// them. So every refusal's `next` ends with the acts the checklist still shows
// not done, from the one source that refusal used; and a bind of the control a
// step acted on (`control`) is told as what it is: a press has no value to
// vary.
//
// **A step not run yet is run first (t174-w108, Cause 6).** A `no_such_step`
// for the number right after the draft's last step is the number a run with
// add true would take, so its `next` says to run it first.
//
// **A moved act names the step it left.** Round 2 moved a3 off the 3-Pack's Add
// to cart; that press stayed in the Flow with no act and was pressed again in
// the next test. The move stands -- it is applied, never refused -- and the
// answer says which step the act left, that it now does no act, and that it is
// pressed in every run unless dropped (`moved`, `../flow-draft/amendment/apply.ts`).
//
// **A step of the Flow keeps its way to its page (live run
// `run-muwao5n4-44977b2a`, D2-1).** Decision 0030 dropped both navigations to
// the friend-requests page with the listing that ran there still in the Flow,
// and was told "applied 7". A drop that leaves a kept step no way to its page
// is now refused (`strands`), and a step the decision newly left after a step
// that does not bring it to its page is said beside the applied decision
// (`../flow-draft/amendment/strand-check.ts`). The refused drop is
// `strands_a_step`, with `next` naming the step it would have stranded. The
// step left unreached is not a refusal and never travels as one: it is
// `unreached`, beside `refused` as `moved` is, each entry with a `note` saying
// which step before it does not bring it to its page and which steps did.
//
// **A step that did not work has no result to stand (live run
// `run-mustvzvg-99695308`, C4).** The read rerun as step 8 was refused
// `malformed_handle` and never ran; four identical reruns of it were each
// refused `changes_nothing` in words written for a read that ran -- "its result
// stands as shown ... go on to the act" -- and the model resent the same call
// until the round stalled. A `changes_nothing` about a step that did not work
// now says that exact call was refused before and would be refused again,
// names the step's own codes and the call whose result says what was refused
// (code-shaped words only, never a page's), and says to change exactly that,
// with `null` to remove a key, or to gather new evidence.
//
// **Every refusal names its way out (W2, refusal churn).** Many reasons got a
// `next` only when a checklist existed, `no_such_step` only for the next free
// number, and `already_so`, `no_such_position`, `run_by_the_loop`,
// `not_a_kept_step`, `did_not_work`, `act_on_a_read`, the `bind_*` reasons and
// `rerun_holds_binding` often none; a refusal with no way out is resent. Every
// reason now has a `next` in the draft's own numbers naming the amendment or
// call to send instead, with or without a checklist (`fallback`, below), and
// ends with the acts the checklist still shows not done when there is one.
//
// **An act claimed on a step that did something else is refused as it is made
// (week report W1).** Live run `run-mux74k5q-1c3c2127` put a1, "put the hub in
// my cart", on the press of "Spain", one of a1's own options, and was answered
// "applied"; the checklist said later that a1 was not done. The claim is now
// refused there (`act_not_done_there`, `../flow-draft/amendment/apply.ts`), and
// the entry carries the act, the judge's sentence (`said`, the checklist's
// `todoSaid`: what the step did and where to name the act) and the step that
// names it (`instead`); `next` is that sentence.
//
// Split into this directory by t694: the feedback (`./feedback.ts`), each
// refusal's way out (`./way-out.ts`, `./fallback.ts`, `./next-step.ts`), and
// the words and codes they share.

export * from "./tool-id.ts";
export * from "./refused-code.ts";
export * from "./feedback.ts";
