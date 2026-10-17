// Agreement between result checks. Runtime checks keep a single affirmative
// judgement; build-test checks require an affirmative confirming judgement.
// Unknown, silent, unavailable or absent confirmation leaves the result unsure.
// Only two agreeing negatives refute; conflicting answers remain unverified.
// This pure boundary preserves any negative reading for the repair controller,
// and on a split the reading of the call that said yes beside it (t477). Where
// both said no for different reasons, both readings are carried, and one Core's
// own record of the reads contradicts is marked so (t501).
//
// **An unsure beside a yes is weighed the same way, and asked once more
// (t503).** Lane C round 17 (`run-mv6lgqi6-4bfab2e1`, trial 3): one call
// answered unknown because later pages were never read, where every paging
// read's own account said its list ended; the other said yes. The trial was
// left unconfirmed and the correct revision retested until the build ran out
// of time. An unsure call now keeps what it doubted (`unsureReading`,
// `../verdict/`); on such a split, a doubt the record contradicts is marked
// (`contradictedUnsure`), and `automationStudioResultVerificationReaskContradicted`
// asks that call once more with the record named. The rule above stands: what
// the re-asked call answers takes its place, so a yes there beside the other
// yes is two yeses, and anything else leaves the verdict unsure.
//
// **A reading that denies an order Core found is marked the same way (t511).**
// Live run `run-mv6qr7fk-77f30b49`: both judges, four times, called an answer
// Core had sorted by date, newest first, "not newest-first", and the repair
// followed them. A double no's reading that denies the order of a column every
// record set's `sortRead` says is in order (`../value-readings/order-claim.ts`)
// is labelled contradicted, as a reading about pages is.
//
// **A no whose advice adds an exclusion the request never states is marked,
// and asked once more (t515).** Live run `run-mv6v2hx5-f448e662`: over a
// correct revision one call said yes and the other no, advising a condition
// "excluding accessories such as" a row the request never excludes. The split
// handed the builder that advice alone (`unconfirmedReading`), it followed, and
// the next revision lost a row the request asks for. Where the caller gives the
// request's wording, a split's no whose advice excludes by words of its own the
// request never says (`../request-rows/unstated-exclusions.ts`) has its advice
// labelled so, as t501 labels a reading, and
// `automationStudioResultVerificationReaskContradicted` asks that call once
// more with the exclusion named. The rule stands: its new answer takes its
// place, so a yes there beside the other yes is two yeses.
//
// **A runtime check's single yes that said the Flow needs a change is not
// confirmed (t515).** The same run's playback check answered yes with
// `patchNeeded: true`, and the run was recorded confirmed: "Passed". Such a yes
// (`answersWithChangeAdvised`, `../verdict/`) is recorded unsure
// (`model_unconfirmed`): not confirmed, not failed, and nothing repaired on its
// advice. A build test's two yeses are untouched: its yes's advice stays
// unconfirmed (`../../flow-bootstrap/unfinished-build/finishing-verdict.ts`).
//
// **A no is only as good as what it names (t607).** A8 everything-store
// `run-mv8p0p7c-c8412344`: a Flow that stored exactly the rows asked for was
// failed by a double no, on byte-identical requests, calling two distinct
// stored listings "the same pair"; another call had called a sponsored,
// unmarked row "qualifying". Where the caller gives the judged summary, each
// no's reading is weighed against Core's own record (`../refuted-no/weigh.ts`):
// duplicates against the stored rows and the answer's dedupe, a missing row
// against the stored rows and the conditions Core settled, a stored row's own
// words, a count, and the pages and order this directory already checks. A no
// whose every named reason the record refutes is marked (`refutedNo`), its
// reading labelled so, and `automationStudioResultVerificationReaskContradicted`
// asks that call once more with Core's findings (`../refuted-no/reask.ts`); a
// no still refuted is taken as unsure, never as a no. A no that names nothing
// Core can check, or anything it cannot refute, stands as before -- and beside
// such a no a refuted one is only labelled, not asked again, so the two keep
// the verdict no (t501) -- and Core never turns a no into a yes.
//
// **A yes held for its exclusion evidence says so as a field (t611).** Where
// both calls answered yes and Core held one or both for the exclusion evidence
// it lacked, the unsure outcome carries `yesUnconfirmed`, as `../verdict/`
// marks one held call. A build read that fact off the reason's words before
// (t601); the words may change, the field does not. Beside an unsure, or a call
// that did not answer, it is absent: only one judge said yes.
//
// **A no that says what a stored row is adds no exclusion, and an unsure beside
// a no is weighed too (t628).** A8 bigbox `run-mv9a4aj0-f9a81d13`: a subflow
// trial's correct no named a stored row its own label calls a holder and
// advised keeping only the item asked for "(exclude holders, ...)". The t515
// re-ask read that as an exclusion the request never states, told the call to
// answer no only where the request's words exclude a row, and the call said yes
// over the holder; the Flow then failed its whole test on that row. Earlier, an
// exact revision was judged unsure beside a no: the unsure doubted the dedupe,
// which Core's record says removed nothing, and the no called two stored rows
// absent. That branch weighed neither, and the builder followed the no. Now: an
// exclusion whose kind is a word of the label of a stored row the no's reading
// names is not marked (`../request-rows/unstated-exclusions.ts`); the t515 recheck
// lets a kept row be answered no where it is not what the request's own words
// name as asked for, quoting them; an unsure's doubt that the dedupe merged
// rows is contradicted where Core's record says it removed none
// (`../refuted-no/dedupe-doubt.ts`), beside a yes or a no; and beside an unsure,
// a no's reading is labelled where Core's record refutes any of it (t607). An
// unsure re-asked there that comes back yes beside a no the record wholly
// refutes has that no asked once more too, since only both can make two yeses.
//
// **A build test's no keeps Core's record of it (t633).** A8 wave 8
// `run-mv9gbsm5-2957581c`: a build swung between a Flow keeping a row its
// judges rightly called not the asked kind and one leaving it out, whose nos
// asked to remove the conditions that left it out. A build test's double no
// (`confirmAnswer`) now carries `standingNo` (`../standing-no-record/`): the
// stored rows, the conditions read with, the stored rows a standing no called
// not the asked kind, and the conditions each standing no asks to remove. It is
// Core's, for the gate that keeps the build's trials, and never said to a model.
//
// **A double no's reading the record refutes in part is labelled too (t641).**
// A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`, trial 2: a revision
// stored exactly the rows asked for and both calls said no. Core's record
// refuted the advice of one -- to change a condition every row of which, left
// out by itself, was another copy of a row in the result -- but that call also
// named a true gap, so the reading was not wholly refuted, and its advice
// reached the builder unlabelled; the builder followed it and dropped the
// condition. A double no now labels each reading the record refutes any of,
// as a split already does (t628): "contradicted" where it refutes all of it,
// "Core's record contradicts part of this reading" with Core's findings where
// some still stands. The verdict is unchanged: a reading with a reason left
// standing still counts. An unconfirmed reading carries the same fact as a
// field (`recordContradicts`), for a gate to read rather than the words.
//
// **A split's no is labelled too, and every judged build test keeps Core's
// record (t652).** A8 frozen pair 5 towels `run-mva6mlo8-f519063c`, trial 6: a
// split's no called a stored row missing, unlabelled, and the builder dropped a
// condition Core's record had vindicated. Both split branches now label it
// (`recordContradicts`), the verdict unchanged; and `standingNo` rides on every
// outcome two calls reach, so a gate keeps such conditions from any judged
// trial (`../standing-no/kept-conditions.ts`). Only a no is weighed by it.
//
// **An unsure that a step chose an option the request does not name is weighed
// too (t655).** Same towels run: a doubt named a step whose option is the
// request's own words. Where every step it names chose one option of a named
// group and that option passes the request-text test, the doubt is marked
// (`about: "narrowing"`, `../unsure-doubts/narrowing.ts`) and asked once
// more with the request's words and the options the step left out
// (`../unsure-doubts/recheck-words.ts`); its answer takes its place.
//
// **A re-ask takes a no's place only where Core settled every reason it gave
// (t686).** A8 cost round `run-mvblov2i-abb7d82e`: a correct no was asked again
// on a recheck about steps before the read alone (t666), because one of its
// sentences named such a step, and the yes took its place. Every re-ask whose
// answer can take a no's place -- a refuted no (t607), a split's unstated
// exclusion (t515) and a no blaming steps that chose the request's words (t666)
// -- now cuts the no's `observed` and `advice` into the reasons they state, by
// one rule (`no-reasons.ts`), and asks only where each reason is the kind its
// recheck addresses or Core's record refutes it. Otherwise the no stands.
// Whether a first verdict is asked a second time (`ask-again.ts`) is no re-ask:
// that second answer is weighed beside the first and replaces nothing.
//
// **A confirming check asks the converse, and a yes that never says why the
// result keeps rows another read stored is not taken (t691).** A8
// `run-mvbr0w7e-6a01c05b`: a read's condition left rows out of what the Flow
// acted on, a later read with no condition stored them all, and a build test's
// two judges said yes on byte-identical temperature-0 requests -- one opinion
// counted twice. The second call that confirms a first yes now asks the
// converse question (`ask-again.ts`, `automationStudioResultVerificationConfirmingAsk`):
// for each stored row, does the request ask for it in its answer, with the
// words that do. And a yes over such rows is held unless it names each beside
// the read that stored it and the request's words asking for it
// (`../request-rows/unquoted-rows.ts`, `stored`); `said.ts` says so in Core's
// words wherever a split or an unsure is explained.
//
// The agreement itself is `verification-agreement.ts` over `agree.ts`; the
// re-asks are `reask-contradicted.ts`; whether a first verdict is asked again
// is `ask-again.ts`; whether a no's reasons let it be asked again is
// `no-reasons.ts`. The rest are the pieces they weigh with: the record a no
// is weighed against (`no-record.ts`, `weighed-no.ts`), the readings the
// record contradicts (`record-contradictions.ts`, `contradicted-unsure.ts`,
// `both-readings.ts`, `refuted-labelled.ts`), a split's unstated exclusion
// (`unstated-exclusion.ts`, `exclusion-words.ts`), and the outcomes two calls
// leave unsettled (`unsettled.ts`, `change-advised.ts`, `yes-readings.ts`,
// `standing-record.ts`).

export * from "./ask-again.ts";
export * from "./no-reasons.ts";
export * from "./reask-contradicted.ts";
// The advice a builder is shown of a judged trial, less a wholly refuted reading's (t687).
export { automationStudioResultAdviceShown } from "./refuted-labelled.ts";
export type { AutomationStudioResultVerificationAgreementInput } from "./types.ts";
// Core's record a no is weighed against, for the narrowing re-ask the verification asks after these (t690).
export { noRecordOf as automationStudioResultVerificationNoRecord } from "./no-record.ts";
export * from "./verification-agreement.ts";
