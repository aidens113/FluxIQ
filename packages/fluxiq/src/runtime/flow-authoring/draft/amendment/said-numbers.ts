// A sentence about the draft, put in the step numbers the model wrote.
//
// **Why (t285 gap 2).** The act judge words its refusal of a claim from the
// draft as it stands when the claim is made (`act_not_done_there`, `said`:
// "Step 3 chose ..., name a1 there with amend_draft add on step 5"). Every
// number an amendment carries names a step as the draft entry the model read
// numbered it (`./shown-numbering.ts`), and a `reorder` earlier in the same
// decision renumbers the draft before the claim is judged, so the sentence
// named the model's step 2 as "Step 3". `instead` was already put back in the
// model's numbers; the sentence now is too.
//
// Only a step number the judge writes is changed -- `Step N` or `step N` --
// and never one inside quoted words (`"Spain (step 9 of 9)"`): those are the
// page's own words, which the judge quotes as JSON strings.

/** A quoted run of the page's words, as `JSON.stringify` writes one, or a step number outside one. */
const QUOTED_OR_STEP = /"(?:[^"\\]|\\.)*"|\b([Ss]tep) (\d+)\b/gu;

/**
 * `said` with each step number outside quoted words put through `number`,
 * which answers the number the model wrote for the step now at a position.
 * Answers `said` itself when no number changes.
 */
export function automationStudioFlowDraftSaidInNumbers(said: string, number: (position: number) => number): string {
  return said.replace(QUOTED_OR_STEP, (match, word: string | undefined, position: string | undefined) =>
    word === undefined || position === undefined ? match : `${word} ${number(Number(position))}`);
}
