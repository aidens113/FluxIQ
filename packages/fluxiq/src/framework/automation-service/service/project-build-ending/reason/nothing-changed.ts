// The supervisor's reason without a claim that the build changed nothing, once the build's own ledger holds an act
// still in place (t791, fix 5b).
//
// Photo-social `run-mvswfjbq-d0a95f6e` ended blocked on "Nothing was changed on the account" while a like the build
// pressed was still on the page. The model cannot know what the build left; the ledger can. Where the ledger names
// anything left (an act in place, one kept, or one possibly there), a sentence that says the site was left as found
// gives way, and the ending names what was left in Core's words (`activity/wording/left-told.ts`) instead. A sentence
// about the Flow or its draft (what was put into it) is not a claim of the site's state and stays.

/** Sentences that say the site was left unchanged. */
const NOTHING_CHANGED: readonly RegExp[] = [
  /\bnothing\b[^.!?;]*\b(?:chang|modif|alter|touch|affect|press|click|done|differ)/iu,
  /\bno (?:lasting |real |other )?(?:change|changes|effect|effects|side effects?)\b/iu,
  /\b(?:did not|didn't|never|has not|hasn't|have not|haven't|does not|doesn't) (?:change|modify|alter|touch|affect|leave)\b/iu,
  /\b(?:left|leaves|leaving) (?:nothing|no change|no changes)\b/iu,
  /\b(?:is|are|was|were|remains?|stays?|stayed|left) (?:unchanged|untouched|as (?:it was|found))\b/iu
];
/** Words that make a sentence about the Flow being built, not about the site. */
const ABOUT_FLOW = /\b(?:flow|draft|script|candidate|steps? list)\b/iu;

/** `reason` without each sentence that says the build changed nothing on the site (header). */
export function automationStudioProjectBuildReasonNothingChanged(reason: string): string {
  const pieces = reason.split(/(?<=[.!?;])\s+/u).map((piece) => piece.trim()).filter((piece) => piece);
  return pieces.filter((piece) => ABOUT_FLOW.test(piece) || !NOTHING_CHANGED.some((claim) => claim.test(piece))).join(" ");
}
