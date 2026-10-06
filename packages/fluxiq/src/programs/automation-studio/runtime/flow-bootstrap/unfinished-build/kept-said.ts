// What an ending tells the person was kept of the Flow so far: one sentence
// for every ending that keeps it (`./budget-exhausted.ts`, `./not-finished.ts`,
// `./replies-unreadable.ts`), so they cannot come to disagree about it.
//
// **Said as what it is (t195-w37, live run `run-murz83zy-5030820f`).** What a
// build that stopped keeps is a draft beside the Flow (`../incomplete-draft/`,
// "never a Flow and never an adaptation"): nothing of it is put into the Flow.
// The money ending said "The Flow so far was kept, and building again carries
// on from it", and the chat's command said under it "What is left: the Flow
// ..., empty": both true, and read together a contradiction. The sentence then
// said "The Flow so far was kept as a draft, not put into the Flow", which
// calls the draft the Flow and then says it is not in it (t195-w44, lane D's
// C4). Now it says what was kept -- the steps found so far, as a draft -- in
// the words the chat's own closing uses for it
// (`../../conversations/commands/create-here.ts`).

/**
 * "The steps I found so far were kept as a draft, so building again carries on
 * from them<tail>." -- or that nothing was kept. `tail` is a clause that
 * finishes the sentence (what of the Flow's ceiling is left).
 */
export function automationStudioFlowBootstrapKeptSaid(kept: boolean, tail = ""): string {
  return kept
    ? `The steps I found so far were kept as a draft, so building again carries on from them${tail}.`
    : "Nothing was kept to carry on from.";
}
