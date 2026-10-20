// The supervisor's ending reason, with what it claims of a part's test left to
// Core's record (t738).
//
// Everything-store `run-mvgf04kw-310fc169` ended on the supervisor's reason
// "the part that reaches checkout never passed its own test", although that
// part's trial had been judged yes and the judged whole run did every one of
// its acts. Core records every part's trials and the judged run's answer
// (`./record-told.ts`); where it says them, a sentence or clause of the
// model's reason that claims how a part's test went -- it names a part, a
// stage or a step, and a test, a pass, a failure or whether it worked -- is
// left out, so the person reads the record's account and never a claim the
// record contradicts. A sentence that opens on its own words before a colon
// keeps them ("... could not be made to work"), and only what follows the
// colon gives way.

/** A part of the Flow, as the model names it. */
const PART = /\b(?:parts?|pieces?|stages?|sections?|steps?)\b/iu;
/** How its test went, as the model claims it. */
const TESTED = /\b(?:test(?:s|ed|ing)?|trials?|tried|pass(?:ed|es|ing)?|fail(?:ed|s|ing|ures?)?|work(?:ed|s|ing)?)\b/iu;

/** Whether `piece` claims how a part's test went (header). */
function claimsPartTest(piece: string): boolean {
  return PART.test(piece) && TESTED.test(piece);
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
