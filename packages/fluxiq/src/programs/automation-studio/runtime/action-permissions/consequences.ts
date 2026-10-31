// What an action can do that outlasts it, as a closed set, and the set of those
// a person has allowed one run to do.
//
// **Classes of consequence, never of control.** Nothing here says what a
// control looks like, what it is called or where it sits. A domain looks at the
// thing it is about to do and says which of these it would cause; Core decides,
// from the set a person permitted, whether the run may. So the web domain can
// read a "Refund" button as `move_money` and a mail domain can read "Send" as
// `send_or_publish`, and neither teaches Core a word of its medium.
//
// **Why these five.** The first proposal was `purchase`, `delete`,
// `modify_existing` and `send_external`. Two things were wrong with it, and
// both were found on the jobs this exists to unblock:
//
// - `purchase` is one way of moving money, not the consequence. A refund, a
//   transfer and a payout are not purchases, so the domain would have had to
//   file a refund under `modify_existing` -- asking a person "may it change an
//   existing order?" when what they need to know is that money will move.
//   `move_money` names the consequence instead of one verb that causes it.
// - Nothing covered **making something new**. "Raise a critical escalation",
//   "schedule a post", "create a ticket" all leave a lasting record other people
//   see, and under the first proposal each was either ungated -- a Flow could
//   fill someone's system with records nobody allowed -- or mislabelled as
//   editing. `create_new` is its own class because the stakes differ: a person
//   who is content to let a run add posts need not be content to let it edit
//   the ones already there.
//
// `send_external` became `send_or_publish` because "external" was the one word
// in it a person would have to interpret: the consequence is that somebody else
// receives or sees it, whoever and wherever they are.
//
// **What is not a consequence.** Moving about, opening, expanding, filtering,
// choosing a row, typing into a field that is not yet submitted -- anything a
// person could undo by looking away -- needs no permission, and a domain asks
// for none. A permission a person has to give for looking would be one they
// learn to give without reading.
//
// **One action may have several.** A refund moves money and changes an
// existing order. The domain declares every class that applies, and the run
// needs all of them, so a person is never asked for the lesser consequence
// while the greater one rides along unnamed.

// The closed vocabulary is model-owned so trusted node definitions can use it
// without importing the runtime. These existing public names stay unchanged.
export * from "../../model/action-consequences/index.ts";
