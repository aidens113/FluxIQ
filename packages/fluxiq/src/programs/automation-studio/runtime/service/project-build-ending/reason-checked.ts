// The supervisor's ending reason, with what it claims of a part's test left to
// Core's record (t738).
//
// Everything-store `run-mvgf04kw-310fc169` ended on the supervisor's reason
// "the part that reaches checkout never passed its own test", although that
// part's trial had been judged yes and the judged whole run did every one of
// its acts. Core records every part's trials and the judged run's answer
// (`./record-told.ts`); where it says them, a sentence or clause of the
// model's reason that claims how a part's test went -- it names a part, a
// stage or a step, and a test, a trial or a pass, or says bare that it failed
// or did not work -- is left out, so the person reads the record's account and
// never a claim the record contradicts. A sentence that opens on its own words
// before a colon keeps them ("... could not be made to work"), and only what
// follows the colon gives way.
//
// **Why something failed stays (t748).** The record says how the parts' tests
// came out in counts, never by name, so it can back no claim about a named
// part's test, and those give way. But "the save step failed because the page
// was full" says a cause the record does not hold at all, and t738's first
// rule left it out with the claims. A sentence naming a part with a failure
// word is kept when it says why (because, since, due to, owing to, when) and
// claims no test, trial or pass.

/** A part of the Flow, as the model names it. */
const PART = /\b(?:parts?|pieces?|stages?|sections?|steps?)\b/iu;
/** That it was tested, and how the test went, as the model claims it. */
const TESTED = /\b(?:test(?:s|ed|ing)?|trials?|tried|pass(?:ed|es|ing)?|judged)\b/iu;
/** That it failed or did not work, as the model says it. */
const FAILED = /\b(?:fail(?:ed|s|ing|ures?)?|work(?:ed|s|ing)?)\b/iu;
/** Words that say why (header, t748). */
const EXPLAINS = /\b(?:because|since|due to|owing to|when)\b/iu;

/** Whether `piece` claims how a part's test went (header): a test, a trial or a pass, or a failure it does not explain. */
function claimsPartTest(piece: string): boolean {
  return PART.test(piece) && (TESTED.test(piece) || (FAILED.test(piece) && !EXPLAINS.test(piece)));
}

/** `reason` with every claim of how a part's test went left out (header); what is left may be empty. */
export function automationStudioProjectBuildReasonChecked(reason: string): string {
  const pieces = reason.split(/(?<=[.!?;])\s+/u).map((piece) => piece.trim()).filter((piece) => piece);
  const kept = pieces.flatMap((piece) => {
    if (!claimsPartTest(piece)) return [piece];
    const colon = piece.indexOf(": ");
    const head = colon > 0 ? piece.slice(0, colon).trim() : "";
    // The sentence's own opening stays, ended as a sentence; the claim after its colon gives way (header).
    return head && !claimsPartTest(head) ? [`${head.replace(/[,;:]$/u, "")}.`] : [];
  });
  return kept.join(" ").replace(/;$/u, ".");
}
