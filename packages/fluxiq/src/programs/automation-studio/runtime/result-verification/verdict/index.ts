// The model's answer, turned into a verdict, and the rule that it fails closed.
//
// The whole of the fail-closed rule is one sentence: only `yes` passes. An
// `unknown`, an omitted field, a reply that carried no diagnosis object, and a
// call that never came back usable are all the same fact -- nobody confirmed
// that the run's result answers the request -- and a run that reports success
// on that basis is exactly the failure this module was built for. The recovery
// verdict draws the same line for a change: `unverifiable` is not `verified`,
// and the change is not promoted on the strength of nothing.
//
// What is recorded on a run is Core's own words. The model's prose is its reading
// of a medium whose contents Core deliberately does not store, so a run record
// that quoted it back would be a copy of that medium in storage under another
// name -- the rule `structured-diagnosis.ts` states and follows. So the reason
// and the observation written onto a run here are composed from Core's counts and
// the verdict word.
//
// **A refutation now also carries what to fix, and the rule above survives it.**
// The user's instruction of 2026-09-26 is that the judgement give explicit
// instructions on what to fix and suggest how, because a verdict and a code sent
// the repair back to rediscover the defect from scratch. So a refutation carries
// `repair`: Core's findings and Core's fix lines, and the model's reading of the
// request screened by the two screens every request passes. The split the rule
// asks for is kept -- `run-outcome.ts` records the Core half onto the run, and
// the model's half travels only into the failure record's `expected` and
// `actual`, which is the field a domain's own sentences have always travelled in
// (`llm/harness/locator-text.ts`). What stays unrecorded is prose in a run's
// metadata; what a failure record says about its own failure is not that.
//
// **A yes has to account for the rows that name the asked item** (live run
// `run-muw60j7c-bb7c9a62`, debug C-2). Both build-test judges answered yes over
// three pairs of earbuds the name condition alone had left out, each "with
// Wireless Charging Case", though the judge's instructions said an item sold
// with an excluded part is still the item. Core flags such rows on the judge's
// copy of the summary (`request-rows/`, `leftOutNamingTheItem`), and a yes that
// does not name each of them -- by a label prefix that tells it apart from the
// rest of its read, or by an id from it -- is not taken: it becomes
// `does_not_answer`, carrying Core's finding and fix line with the condition,
// the item and the rows, so the repair has the rows themselves. It keeps the
// wrong-answer code, which is what routes a run to its re-author
// (`recovery/refuted-result/reauthor.ts`), and counts as a no in the pair rules
// (`agreement.ts`) and in a build's test (`build-test/judge.ts`).
//
// **And a no's named rows are checked against the run** (debug C-5). The result
// judges said the Plus condition "alone excluded" B0J5MCMBAY and B07Z1RZGJG; both
// are in the stored result, and the re-author followed that reading and threw
// away the answer it held. So a refutation carries `repair.checked`: Core's lines
// on each row the judgement names, in Core's words (`request-rows/checked-rows.ts`).
//
// **And a yes over any row a condition alone left out quotes the request's own
// words that exclude it (t515).** Live run `run-mv6v2hx5-f448e662`: a request
// listed one exclusion, a revision's second condition left out a row it never
// excludes, and both build-test judges said yes, naming the row and calling it
// "an accessory". Where the caller gives the request's wording (`wording`),
// each such row has to stand in a sentence of the reply that quotes words of
// the request excluding it, and not only the words it searched by
// (`request-rows/unquoted-rows.ts`); a yes that leaves one without is not
// taken, as above, and `repair.checked` names the rows in Core's words. A row
// a numeric bound left out whose value Core read as failing it is settled by
// Core and needs no quote beside it; the yes still quotes, once, the request's
// words stating that bound (t574, `value-readings/settled-rows.ts`).
//
// **A yes that says the Flow needs a change is coded so (t515).** The same
// run's playback check answered yes with `patchNeeded: true`, and the run was
// recorded confirmed. A yes stays a yes here -- a build's two yeses still finish
// it, its advice unconfirmed (`flow-bootstrap/unfinished-build/`
// `finishing-verdict.ts`, cause 10) -- but carries `answersWithChangeAdvised`,
// and a runtime check's single yes so coded is not confirmed (`agreement.ts`).
//
// **A yes that lacks its quote is held, even when it advised a change (t636).**
// A8 social `run-mv9ml775-9872e63e` step 0132: a yes with `patchNeeded: true`
// that did not quote the request beside one left-out row became a no with no
// reading, and two yeses over a correct result came out a split. A missing
// quote is a held yes: it is unsure (`exclusion_evidence_missing`), keeps what
// it compared (`answeredReading`), and is rechecked like any held yes
// (`verify.ts`). It carries `changeAdvised` in place of `yesUnconfirmed`, which
// is said only of a plain yes, and a recheck's yes keeps the advice's code.
//
// **And a yes looks at the rows the result keeps that Core measured as unlike
// the rest (t663).** A8 towels `run-mvahlxuu-760d9e28`: a trial kept a holder
// for the item beside the nine items asked for, and both re-asked judges said
// yes; every gate above is about rows a condition left out. Core flags a kept
// row that alone has no value in an answer column, or whose name alone does
// not write the request's item phrase (`request-rows/kept-without-asked-column.ts`,
// `request-rows/kept-not-naming-the-item.ts`, each with thresholds that keep an
// ordinary list unflagged), and a yes has to name each flagged row in a
// sentence quoting the request's words (`request-rows/unquoted-rows.ts`). One
// that does not is held as a missing quote is, never refused: the row may be
// exactly what was asked, and the hold asks only that it be looked at.
//
// **And a no carries the defects it lists (t752).** A breadth rerun's trial
// stored exactly the rows asked for, and both judges said no for a method
// objection and a claim about a condition, naming no row wrongly kept, no row
// missing and no wrong value. A no now lists each defect it rests on
// (`diagnosis.defects`), and its reading carries each well-formed one,
// screened as every word a judge wrote is (`defects.ts`), for Core to find in
// its own record before the no counts (`../agreement/unsupported-no.ts`).
//
// The verdict itself is `result-verdict.ts`; its codes `codes.ts`, its input
// `types.ts`, the answer word `from-diagnosis.ts`, Core's one-line account
// `observation.ts`, and the kept rows a yes is held to `kept-rows-flagged.ts`.
// The rest are the lines, reasons and pieces `result-verdict.ts` composes.

export { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "./codes.ts";
export { automationStudioResultScreenedDefects } from "./defects.ts";
export { automationStudioResultVerdictFromDiagnosis } from "./from-diagnosis.ts";
export { automationStudioResultKeptRowsFlagged } from "./kept-rows-flagged.ts";
export { automationStudioResultObservation } from "./observation.ts";
export { automationStudioResultVerdict } from "./result-verdict.ts";
export type { AutomationStudioResultVerdictInput } from "./types.ts";
