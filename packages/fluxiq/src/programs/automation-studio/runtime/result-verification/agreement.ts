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
// `./verdict.ts`); on such a split, a doubt the record contradicts is marked
// (`contradictedUnsure`), and `automationStudioResultVerificationReaskContradicted`
// asks that call once more with the record named. The rule above stands: what
// the re-asked call answers takes its place, so a yes there beside the other
// yes is two yeses, and anything else leaves the verdict unsure.
//
// **A reading that denies an order Core found is marked the same way (t511).**
// Live run `run-mv6qr7fk-77f30b49`: both judges, four times, called an answer
// Core had sorted by date, newest first, "not newest-first", and the repair
// followed them. A double no's reading that denies the order of a column every
// record set's `sortRead` says is in order (`./value-readings/order-claim.ts`)
// is labelled contradicted, as a reading about pages is.
//
// **A no whose advice adds an exclusion the request never states is marked,
// and asked once more (t515).** Live run `run-mv6v2hx5-f448e662`: over a
// correct revision one call said yes and the other no, advising a condition
// "excluding accessories such as" a row the request never excludes. The split
// handed the builder that advice alone (`unconfirmedReading`), it followed, and
// the next revision lost a row the request asks for. Where the caller gives the
// request's wording, a split's no whose advice excludes by words of its own the
// request never says (`request-rows/unstated-exclusions.ts`) has its advice
// labelled so, as t501 labels a reading, and
// `automationStudioResultVerificationReaskContradicted` asks that call once
// more with the exclusion named. The rule stands: its new answer takes its
// place, so a yes there beside the other yes is two yeses.
//
// **A runtime check's single yes that said the Flow needs a change is not
// confirmed (t515).** The same run's playback check answered yes with
// `patchNeeded: true`, and the run was recorded confirmed: "Passed". Such a yes
// (`answersWithChangeAdvised`, `./verdict.ts`) is recorded unsure
// (`model_unconfirmed`): not confirmed, not failed, and nothing repaired on its
// advice. A build test's two yeses are untouched: its yes's advice stays
// unconfirmed (`../flow-bootstrap/unfinished-build/finishing-verdict.ts`).
//
// **A no is only as good as what it names (t607).** A8 everything-store
// `run-mv8p0p7c-c8412344`: a Flow that stored exactly the rows asked for was
// failed by a double no, on byte-identical requests, calling two distinct
// stored listings "the same pair"; another call had called a sponsored,
// unmarked row "qualifying". Where the caller gives the judged summary, each
// no's reading is weighed against Core's own record (`./refuted-no/weigh.ts`):
// duplicates against the stored rows and the answer's dedupe, a missing row
// against the stored rows and the conditions Core settled, a stored row's own
// words, a count, and the pages and order this file already checks. A no
// whose every named reason the record refutes is marked (`refutedNo`), its
// reading labelled so, and `automationStudioResultVerificationReaskContradicted`
// asks that call once more with Core's findings (`./refuted-no/reask.ts`); a
// no still refuted is taken as unsure, never as a no. A no that names nothing
// Core can check, or anything it cannot refute, stands as before -- and beside
// such a no a refuted one is only labelled, not asked again, so the two keep
// the verdict no (t501) -- and Core never turns a no into a yes.
//
// **A yes held for its exclusion evidence says so as a field (t611).** Where
// both calls answered yes and Core held one or both for the exclusion evidence
// it lacked, the unsure outcome carries `yesUnconfirmed`, as `./verdict.ts`
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
// names is not marked (`request-rows/unstated-exclusions.ts`); the t515 recheck
// lets a kept row be answered no where it is not what the request's own words
// name as asked for, quoting them; an unsure's doubt that the dedupe merged
// rows is contradicted where Core's record says it removed none
// (`refuted-no/dedupe-doubt.ts`), beside a yes or a no; and beside an unsure,
// a no's reading is labelled where Core's record refutes any of it (t607). An
// unsure re-asked there that comes back yes beside a no the record wholly
// refutes has that no asked once more too, since only both can make two yeses.
//
// **A build test's no keeps Core's record of it (t633).** A8 wave 8
// `run-mv9gbsm5-2957581c`: a build swung between a Flow keeping a row its
// judges rightly called not the asked kind and one leaving it out, whose nos
// asked to remove the conditions that left it out. A build test's double no
// (`confirmAnswer`) now carries `standingNo` (`./standing-no-record/`): the
// stored rows, the conditions read with, the stored rows a standing no called
// not the asked kind, and the conditions each standing no asks to remove. It is
// Core's, for the gate that keeps the build's trials, and never said to a model.

import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioResultVerdict, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "./contracts/index.ts";
import { automationStudioResultReadPagesClause, automationStudioResultReadStop } from "./read-account/index.ts";
import {
  automationStudioResultDedupeDoubtContradicted,
  automationStudioResultNoRecord,
  automationStudioResultReaskRefutedNo,
  automationStudioResultRefutedReading,
  type AutomationStudioResultNoClaim,
  type AutomationStudioResultNoRecord,
  type AutomationStudioResultNoWeighed
} from "./refuted-no/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "./repair-directive.ts";
import { automationStudioRequestUnstatedExclusions, type AutomationStudioRequestWording } from "./request-rows/index.ts";
import type { AutomationStudioResultStandingNoRecord } from "./standing-no/index.ts";
import { automationStudioResultNamedStoredLabels, automationStudioResultStandingNoRecord } from "./standing-no-record/index.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "./unsettled/index.ts";
import { automationStudioResultOrderClaimContradicted } from "./value-readings/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "./verdict.ts";

/** What one call that judged `does_not_answer` said. */
type JudgeReading = NonNullable<AutomationStudioResultVerification["unconfirmedReading"]>;

export type AutomationStudioResultVerificationAgreementInput = {
  /** The verdict the first call reached. */
  first: AutomationStudioResultVerification;
  /** The verdict the second call reached, asked only when `automationStudioResultVerificationAskAgain` said so. */
  second?: AutomationStudioResultVerification | undefined;
  /** True when a first `answers` is confirmed by a second call (the build-test judge). */
  confirmAnswer?: boolean | undefined;
  /**
   * Core's own account of each list read of the judged result
   * (`AutomationStudioRunResultSummary.reads`): what a reading that says there
   * are more pages is weighed against on a double no (t501). Absent, no reading
   * is marked.
   */
  reads?: readonly AutomationStudioResultReadAccount[] | undefined;
  /**
   * The judged result's record sets (`AutomationStudioRunResultSummary.recordSets`):
   * each one's `sortRead` is what a reading that denies an order is weighed
   * against on a double no (t511). Absent, no reading is marked for order.
   */
  recordSets?: readonly AutomationStudioResultRecordSetSummary[] | undefined;
  /**
   * The request as the judges read it (`request-rows/request-wording.ts`): what
   * a split's no's advice is held to, and its call asked once more where the
   * advice excludes by words the request never states (t515). Absent, no
   * advice is marked.
   */
  wording?: AutomationStudioRequestWording | undefined;
  /**
   * The judged summary itself (`AutomationStudioRunResultSummary`), and the
   * request's text: Core's record a no's reasons are weighed against
   * (`./refuted-no/`, t607). Absent, no no is weighed and every no stands.
   */
  summary?: AutomationStudioRunResultSummary | undefined;
  requestText?: string | undefined;
};

/** How a verification reads a first answer: whether a `yes` is confirmed too. */
export type AutomationStudioResultVerificationAskAgainOptions = { confirmAnswer?: boolean | undefined };

/**
 * Whether a first verdict is asked once more: the model answered, and did not
 * answer `yes` -- or did, and the verification confirms answers. A reply that
 * carried no verdict and a call that never came back are not asked again.
 */
export function automationStudioResultVerificationAskAgain(first: AutomationStudioResultVerification, options: AutomationStudioResultVerificationAskAgainOptions = {}): boolean {
  if (first.exclusionEvidenceMissing) return true;
  return first.basis === "model" && (first.verdict !== "answers" || options.confirmAnswer === true);
}

/**
 * The one verification a run records, from one or two calls.
 *
 * Every outcome carries `verdicts` (the verdict words, in the order asked) and
 * `calls`. A second verdict given for a first that is not asked again is
 * ignored.
 */
export function automationStudioResultVerificationAgreement(input: AutomationStudioResultVerificationAgreementInput): AutomationStudioResultVerification {
  return agree(input);
}

/** The agreement, `reasked` naming the call a split's no was asked again for (t515), so its mark says so. */
function agree(input: AutomationStudioResultVerificationAgreementInput, reasked?: 1 | 2): AutomationStudioResultVerification {
  const { first, second } = input;
  if (!second && first.basis === "model" && first.verdict === "answers" && input.confirmAnswer === true) {
    return { schemaVersion: first.schemaVersion, verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.unconfirmed, reason: `This result was checked once: the first answer was that it does what was asked, but the required confirming check was not supplied. ${UNSETTLED.model_unconfirmed.run}`, observation: first.observation, verdicts: [first.verdict], calls: 1 };
  }
  if (!second || !automationStudioResultVerificationAskAgain(first, { confirmAnswer: input.confirmAnswer })) {
    // A runtime check's single yes that said the Flow needs a change is not confirmed (header, t515).
    if (first.basis === "model" && first.verdict === "answers" && first.code === AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answersWithChangeAdvised) return changeAdvised(first);
    return { ...first, verdicts: [first.verdict], calls: 1 };
  }
  const verdicts: AutomationStudioResultVerdict[] = [first.verdict, second.verdict];
  if ((first.exclusionEvidenceMissing || second.exclusionEvidenceMissing) && first.verdict !== "does_not_answer" && second.verdict !== "does_not_answer") {
    return {
      schemaVersion: first.schemaVersion, verdict: "unsure", basis: "model_unconfirmed", code: "core.result.exclusion_evidence_missing",
      reason: "The checks did not provide the required exclusion evidence, so the result remains unconfirmed.",
      observation: first.observation, verdicts, calls: 2,
      exclusionEvidenceMissing: [...(first.exclusionEvidenceMissing ?? []), ...(second.exclusionEvidenceMissing ?? [])],
      // Both calls answered yes, one or both held for the evidence it lacked (header, t611). An unsure, or a call that did not answer, beside it is no yes.
      ...(answeredYes(first) && answeredYes(second) ? { yesUnconfirmed: true as const } : {})
    };
  }
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  const weigh = { wording: input.wording, reasked, record: noRecordOf(input) };
  if (first.verdict === "answers") {
    // A confirmation that never came back usable confirms nothing (run-mux6nxst-c9bca37c): the yes is unconfirmed.
    if (second.basis === "model_unavailable") {
      return unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked once: the first answer was that it does what was asked, and the second check, which confirms a yes, gave no answer, because it did not come back usable (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts);
    }
    if (second.verdict === "answers") return { ...first, verdicts, calls: 2 };
    if (second.verdict !== "does_not_answer") {
      return { ...unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked twice with the same evidence: the first answer was that it does what was asked, and the confirming check gave ${said(second)} (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts), ...contradictedUnsure(2, second, input) };
    }
    return { ...unsettled(first, second, "model_disagreed", codes.disagree, `This result was checked twice with the same evidence, and the answers differed: the first was that it does what was asked, the second that it does not. ${UNSETTLED.model_disagreed.run}`, verdicts, weigh), ...refutedMark(input, [2]) };
  }
  if (first.verdict === "does_not_answer" && second.verdict === "does_not_answer") {
    // A no whose every reason Core's record refutes is marked, to be asked once more (t607, `./refuted-no/`).
    const refuted = refutedMark(input, [1, 2]);
    // Both readings, each its own call's and labelled so (`bothReadings`):
    // two calls with the same evidence reach identical Core findings, but their
    // prose can name different defects. Live run `run-mv6i27oi-a87fb247` (D1):
    // the first blamed paging against the record, the second named the two
    // stored rows that were wrong, and only the first was forwarded.
    return {
      ...bothReadings(first, second, input.reads, input.recordSets, refutedFindings(input)),
      // Nothing about the steps: this file reads only the two verdicts, and a
      // build's test can pass with a step it excused failing. "Although every
      // step of the run succeeded" was said above "Step 15 (×) failed" (t193
      // 1002-M, `run-murzln6g-11debe1d`, C6).
      reason: "The result was judged not to answer the request the Flow was built for, twice and with the same evidence.",
      verdicts,
      calls: 2,
      ...refuted,
      // A build test's no keeps Core's record of it, for the gate that keeps the build's trials (header, t633). Core-only.
      ...standingNoOf(input)
    };
  }
  if (second.verdict === "answers") {
    return { ...unsettled(first, second, "model_disagreed", codes.disagree, `This result was checked twice with the same evidence, and the answers differed: the first was ${said(first)}, the second that it does. ${UNSETTLED.model_disagreed.run}`, verdicts, weigh), ...contradictedUnsure(1, first, input), ...refutedMark(input, [1]) };
  }
  // Neither yes nor two nos (header, t628): a doubt Core's record contradicts is marked, to be asked once more (t503), and
  // the no's reading, where one said no, is labelled where the record refutes any of it (t607). Re-asking that no alone
  // could not make two yeses, so it is asked only after a contradicted doubt asked again comes back yes.
  const noCall: 1 | 2 | undefined = first.verdict === "does_not_answer" ? 1 : second.verdict === "does_not_answer" ? 2 : undefined;
  const weighed = noCall ? weighedNo(input, noCall) : undefined;
  const refuted = noCall && weighed?.findings.length ? { call: noCall, ...weighed } : undefined;
  const doubt = contradictedUnsure(1, first, input).contradictedUnsure ? contradictedUnsure(1, first, input) : contradictedUnsure(2, second, input);
  return {
    ...unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked twice with the same evidence, and neither answer was that it does what was asked, nor were both that it does not: the first was ${said(first)}, the second ${said(second)} (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts, { refuted }),
    ...doubt
  };
}

/**
 * The one re-ask of an unsure call whose doubt Core's record contradicts
 * (header, t503). `settled` is what the two calls came to; when it marks a
 * contradicted unsure not yet asked again, `ask` asks that same call once more,
 * with `recheck` -- Core's words naming the record -- on the copy it is shown,
 * and its answer takes that call's place under the same rule. A re-ask that
 * did not come back usable leaves `settled` as it was. Never asked twice: the
 * outcome is marked `reasked`, and a marked one is returned unchanged.
 */
export async function automationStudioResultVerificationReaskContradicted(input: AutomationStudioResultVerificationAgreementInput & {
  settled: AutomationStudioResultVerification;
  /** Asks call `call` once more, its copy carrying `recheck`. */
  ask: (recheck: string, call: 1 | 2) => Promise<AutomationStudioResultVerification>;
}): Promise<AutomationStudioResultVerification> {
  const { settled, second } = input;
  if (!second) return settled;
  const marked = settled.contradictedUnsure;
  if (!marked) {
    // A no whose every reason Core's record refutes, asked once more with Core's findings (t607, `./refuted-no/reask.ts`).
    const record = noRecordOf(input);
    if (settled.refutedNo && !settled.refutedNo.reasked && record) {
      return automationStudioResultReaskRefutedNo({ first: input.first, second, settled, record, ask: input.ask, agree: (one, two) => agree({ ...input, first: one, second: two }) });
    }
    return reaskUnstatedExclusion(input, settled, second);
  }
  if (marked.reasked) return settled;
  const reasked = await input.ask(recheckWords(marked), marked.call);
  const verdicts: AutomationStudioResultVerdict[] = [...(settled.verdicts ?? []), reasked.verdict];
  const done = { ...marked, reasked: true as const };
  if (reasked.basis !== "model") return { ...settled, verdicts, calls: 3, contradictedUnsure: done };
  const first = marked.call === 1 ? reasked : input.first;
  const other = marked.call === 2 ? reasked : second;
  const again = automationStudioResultVerificationAgreement({ ...input, first, second: other });
  const outcome = { ...again, verdicts, calls: 3, contradictedUnsure: done };
  // The doubt asked again said yes beside a no Core's record wholly refutes: that no is asked once more too (header, t628).
  const record = noRecordOf(input);
  if (reasked.verdict !== "answers" || !again.refutedNo || again.refutedNo.reasked || !record) return outcome;
  const chained = await automationStudioResultReaskRefutedNo({ first, second: other, settled: outcome, record, ask: input.ask, agree: (one, two) => agree({ ...input, first: one, second: two }) });
  // Every call asked, the two, the doubt's re-ask and the no's: the refuted re-ask counts from two.
  const calls = chained.verdicts?.length ?? chained.calls;
  return { ...chained, ...(calls !== undefined ? { calls } : {}), contradictedUnsure: done };
}

/**
 * The one re-ask of a split's no whose advice adds an exclusion the request
 * never states (header, t515): that call is asked once more with the
 * exclusion named, and its answer takes its place under the same rule. A
 * re-ask that did not come back usable leaves `settled` as it was. Nothing is
 * asked without the request's wording, or where the no's exclusions are stated.
 */
async function reaskUnstatedExclusion(
  input: Parameters<typeof automationStudioResultVerificationReaskContradicted>[0],
  settled: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification
): Promise<AutomationStudioResultVerification> {
  const unstated = settled.basis === "model_disagreed" ? unstatedExclusion(input.first, second, input.wording, noRecordOf(input)) : undefined;
  if (!unstated) return settled;
  const reasked = await input.ask(exclusionRecheckWords(unstated.exclusions), unstated.call);
  const verdicts: AutomationStudioResultVerdict[] = [...(settled.verdicts ?? []), reasked.verdict];
  if (reasked.basis !== "model") return { ...settled, verdicts, calls: 3 };
  const again = agree({ ...input, first: unstated.call === 1 ? reasked : input.first, second: unstated.call === 2 ? reasked : second }, unstated.call);
  return { ...again, verdicts, calls: 3 };
}

/**
 * The call of a split that said no, and the exclusions its advice adds that the
 * request never states; nothing without both. With Core's record, an exclusion
 * that says what a stored row the no's reading names is, is not one (header, t628).
 */
function unstatedExclusion(
  first: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification,
  wording: AutomationStudioRequestWording | undefined,
  record: AutomationStudioResultNoRecord | undefined
): { call: 1 | 2; exclusions: string[] } | undefined {
  if (!wording) return undefined;
  const call = first.verdict === "does_not_answer" ? 1 : second.verdict === "does_not_answer" ? 2 : undefined;
  if (!call) return undefined;
  const judgement = (call === 1 ? first : second).repair?.judgement;
  const exclusions = automationStudioRequestUnstatedExclusions(judgement?.advice, wording, record ? automationStudioResultNamedStoredLabels(judgement, record) : []);
  return exclusions.length ? { call, exclusions } : undefined;
}

/**
 * What a split's no asked again is told (header, t515): Core's words and the
 * advice's own exclusions, naming no site or task. A kept row may still be
 * answered no by the words of the request naming what it asks for, which the
 * row is not (t628): narrowing to the request's own item excludes nothing the
 * request does not say.
 */
function exclusionRecheckWords(exclusions: readonly string[]): string {
  return "This same evidence was judged before, and that answer advised leaving out rows by words the request never states as an exclusion: "
    + `${quotedExclusions(exclusions)}. `
    + "A request excludes only what its own words state; the words it searches or navigates by say where to look and exclude nothing. "
    + "Answer again from the evidence, and answer no over a row the result keeps only where you quote words of the request that it fails: "
    + "words that exclude it, or the words naming what the request asks for, which that row by its own words is not.";
}

function quotedExclusions(exclusions: readonly string[]): string {
  return exclusions.map((exclusion) => `"${exclusion}"`).join(", ");
}

/** What a call asked again is told (header, t503; a doubt about the dedupe, t628): Core's words, naming no site or task. */
function recheckWords(marked: NonNullable<AutomationStudioResultVerification["contradictedUnsure"]>): string {
  if (marked.about === "dedupe") {
    return "This same evidence was judged before, and that answer could not tell because it took the answer's dedupe to have merged distinct rows into one. "
      + `Core's own record of this answer says otherwise: ${marked.record} `
      + "Answer again from the evidence, holding any reading about repeated or merged rows to that record; answer unknown only for a doubt the record does not settle.";
  }
  return "This same evidence was judged before, and that answer could not tell because it took the list to have pages its read never reached. "
    + `Core's own record of each paging read says otherwise: ${marked.record} `
    + "Answer again from the evidence, holding any reading about pages to that record; answer unknown only for a doubt the record does not settle.";
}

/**
 * `{ contradictedUnsure }` when `verification` is an unsure a model gave whose
 * doubt speaks of pages left unread where every paging read's record says its
 * list ended (`contradictsPagingRecord`), or of rows the dedupe merged where
 * Core's record says it removed none (`./refuted-no/dedupe-doubt.ts`, t628),
 * naming the record; nothing otherwise.
 */
function contradictedUnsure(call: 1 | 2, verification: AutomationStudioResultVerification, input: AutomationStudioResultVerificationAgreementInput): { contradictedUnsure?: NonNullable<AutomationStudioResultVerification["contradictedUnsure"]> } {
  const doubt = verification.verdict === "unsure" && verification.basis === "model" ? verification.unsureReading : undefined;
  if (!doubt) return {};
  if (contradictsPagingRecord(doubt, input.reads)) {
    const record = pagingReads(input.reads).map((read) => `Read ${read.nodeId} read ${automationStudioResultReadPagesClause(read)}.`).join(" ");
    return { contradictedUnsure: { call, record } };
  }
  const record = noRecordOf(input);
  const dedupe = record ? automationStudioResultDedupeDoubtContradicted(doubt, record) : undefined;
  return dedupe ? { contradictedUnsure: { call, record: dedupe, about: "dedupe" } } : {};
}

/** An answer in Core's own words, as it finishes "the first was ...". */
function said(verification: AutomationStudioResultVerification): string {
  if (verification.basis === "model_unavailable") return "no answer, because the check did not come back usable";
  if (verification.basis === "model_silent") return "no answer, because the reply gave none";
  if (verification.verdict === "does_not_answer" && passedOverRows(verification)) return "that it does what was asked, without saying why the rows a condition alone left out that name the item asked for are excluded";
  // A yes `verdict.ts` did not take for want of the request's own words beside a left-out row (t515): its reason, Core's, says so.
  if (verification.verdict === "does_not_answer" && verification.repair?.judgement === undefined && verification.reason.includes("without quoting")) return "that it does what was asked, without quoting the request's words that exclude each row a condition alone left out";
  if (verification.verdict === "does_not_answer") return "that it does not do what was asked";
  if (verification.verdict === "answers") return "that it does what was asked";
  return "that it could not be told";
}

/** Whether a `does_not_answer` is a yes Core did not take (`verdict.ts`): it carries that finding and no reading of its own. */
function passedOverRows(verification: AutomationStudioResultVerification): boolean {
  return verification.repair?.judgement === undefined
    && (verification.repair?.findings ?? []).some((finding) => finding.code === AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem);
}

/**
 * A verification two checks did not settle. Its verdict is `unsure`, because
 * nobody could tell, and it carries no failure record, because it does not
 * fail the run (`automationStudioResultVerificationFailsRun`).
 *
 * It keeps the reading of the call that judged `does_not_answer`, where one
 * did, as `unconfirmedReading` (live run murwcmx2: the first call advised
 * narrowing a condition, the second did not come back, and the build's repair
 * was told only "unverified"). At most one of the two calls can have judged
 * `does_not_answer` here -- two did is a refutation -- so nothing is spliced.
 *
 * Where the two split (`model_disagreed`), it keeps the other call's reading
 * too, as `answeredReading`: what the yes compared. Live run
 * `run-mv5uu9g1-9d80deea` passed on only the no, which had read the start
 * view's pagination as the read's page; the yes had read the end view's
 * "14 of 14 results", and the model hunted for pages that were not there.
 * Each reading stays its own call's, never merged into the other.
 */
function unsettled(
  first: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification,
  basis: "model_disagreed" | "model_unconfirmed",
  code: string,
  reason: string,
  verdicts: AutomationStudioResultVerdict[],
  weigh: {
    wording?: AutomationStudioRequestWording | undefined;
    reasked?: 1 | 2 | undefined;
    record?: AutomationStudioResultNoRecord | undefined;
    /** The no's call and what Core's record says of its reading, where it refutes any of it (header, t628). */
    refuted?: ({ call: 1 | 2 } & AutomationStudioResultNoWeighed) | undefined;
  } = {}
): AutomationStudioResultVerification {
  const read = unconfirmedReading(first) ?? unconfirmedReading(second);
  // A split's no whose advice adds an exclusion the request never states, marked so (header, t515).
  const unstated = basis === "model_disagreed" ? unstatedExclusion(first, second, weigh.wording, weigh.record) : undefined;
  const marked = read && unstated ? { ...read, advice: markedAdvice(unstated, read.advice ?? "", weigh.reasked === unstated.call) } : read;
  const reading = marked && weigh.refuted ? refutedLabelled(marked, weigh.refuted) : marked;
  const answered = basis === "model_disagreed" ? answeredReadingOf(first) ?? answeredReadingOf(second) : undefined;
  return { schemaVersion: first.schemaVersion, verdict: "unsure", basis, code, reason, observation: first.observation, verdicts, calls: 2, ...(reading ? { unconfirmedReading: reading } : {}), ...(answered ? { answeredReading: answered } : {}) };
}

/**
 * A split's no's advice, labelled as adding an exclusion the request never
 * states (header, t515), as t501 labels a reading: its call, Core's words and
 * the exclusions, then the advice in its own words, unchanged.
 */
function markedAdvice(unstated: { call: 1 | 2; exclusions: readonly string[] }, advice: string, reasked: boolean): string {
  const again = reasked ? "; asked once more with this named, it advised the same" : "";
  return `Judge call ${unstated.call} (Core's check: this advice adds an exclusion the request never states, ${quotedExclusions(unstated.exclusions)}, and a request excludes only what its own words state, so do not add it unless the request's words say so${again}): ${advice}`;
}

/**
 * A no's reading labelled with what Core's record refutes of it (header, t628),
 * as t501 labels a reading: its call and Core's findings, then its own words,
 * unchanged. Wholly refuted, it is "contradicted"; otherwise the label says the
 * record contradicts part of it, and the rest stands. `expected` restates the
 * request and is left as it is.
 */
function refutedLabelled(reading: JudgeReading, refuted: { call: 1 | 2 } & AutomationStudioResultNoWeighed): JudgeReading {
  const label = refuted.wholly
    ? `Judge call ${refuted.call} (contradicted by Core's record: ${refuted.findings.join(" ")})`
    : `Judge call ${refuted.call} (Core's record contradicts part of this reading: ${refuted.findings.join(" ")})`;
  return {
    ...reading,
    ...(reading.observed ? { observed: `${label}: ${reading.observed}` } : {}),
    ...(reading.advice ? { advice: `${label}: ${reading.advice}` } : {})
  };
}

/**
 * A runtime check's single yes that said the Flow needs a change (header,
 * t515): unsure and unconfirmed, keeping what the yes compared, with no
 * failure record and no repair, so it neither confirms nor fails the run.
 */
function changeAdvised(first: AutomationStudioResultVerification): AutomationStudioResultVerification {
  const answered = answeredReadingOf(first);
  return {
    schemaVersion: first.schemaVersion,
    verdict: "unsure",
    basis: "model_unconfirmed",
    code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answersWithChangeAdvised,
    reason: `This result was checked once: the answer was that it does what was asked, but the same answer said the Flow needs a change, so it is not taken as a clean pass. ${UNSETTLED.model_unconfirmed.run}`,
    observation: first.observation,
    verdicts: [first.verdict],
    calls: 1,
    ...(answered ? { answeredReading: answered } : {})
  };
}

/** What a call that judged `answers` compared, copied; nothing for any other call or an empty reading. */
function answeredReadingOf(verification: AutomationStudioResultVerification): NonNullable<AutomationStudioResultVerification["answeredReading"]> | undefined {
  if (verification.verdict !== "answers" || !verification.answeredReading) return undefined;
  const { expected, observed } = verification.answeredReading;
  const reading = { ...(expected ? { expected } : {}), ...(observed ? { observed } : {}) };
  return Object.keys(reading).length ? reading : undefined;
}

/** What a call that judged `does_not_answer` said, copied off its directive; nothing for any other call or an empty reading. */
function unconfirmedReading(verification: AutomationStudioResultVerification): JudgeReading | undefined {
  if (verification.verdict !== "does_not_answer") return undefined;
  const judgement = verification.repair?.judgement;
  if (!judgement) return undefined;
  const reading: JudgeReading = {
    ...(judgement.expected ? { expected: judgement.expected } : {}),
    ...(judgement.observed ? { observed: judgement.observed } : {}),
    ...(judgement.advice ? { advice: judgement.advice } : {})
  };
  return Object.keys(reading).length ? reading : undefined;
}

/** One call's reading as the repair is told it, and, where Core's record contradicts it, what the reading says of itself. */
type Weighed = { call: 1 | 2; verification: AutomationStudioResultVerification; reading: JudgeReading; contradicted: boolean; because?: string };

/** What a reading marked contradicted says of itself, after its call's number. */
const CONTRADICTED = "contradicted by Core's record: every read's own account says its list ended with no further page, so what this reading says about more pages is mistaken";
/** What a reading that denies an order Core found says of itself (t511). */
const CONTRADICTED_ORDER = "contradicted by Core's record: Core sorted the answer itself, and its sortRead says how it read the sorted column and that the rows are in that order, so what this reading says about the order is mistaken";

/**
 * The refutation two calls that both said no come to (t501, D1).
 *
 * Where only one call gave a reading, or both gave the same, and the record
 * contradicts neither, the first call's directive stands exactly as before.
 * Otherwise the judgement carries every reading, each field's parts labelled
 * "Judge call N" (a field both worded alike is said once, unlabelled), the one
 * the record does not contradict first, and a reading the record contradicts
 * says so in its label: a judge said there are more
 * pages where every paging read's own account says its list ended
 * (`contradictsPagingRecord`). Nothing is spliced: each part is one call's own
 * words under its own label. The findings are Core's and identical by
 * construction; `checked` lines are Core's checks of the rows each reading
 * names, so both calls' are kept. The failure record is the leading call's.
 */
function bothReadings(
  first: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification,
  reads: readonly AutomationStudioResultReadAccount[] | undefined,
  recordSets: readonly AutomationStudioResultRecordSetSummary[] | undefined,
  /** Core's findings on each call whose every reason its record refutes (t607, `./refuted-no/`). */
  refuted: ReadonlyMap<1 | 2, readonly string[]> = new Map()
): AutomationStudioResultVerification {
  const weighed: Weighed[] = [];
  for (const [call, verification] of [[1, first], [2, second]] as const) {
    const reading = verification.repair?.judgement;
    if (!reading || !(reading.expected || reading.observed || reading.advice)) continue;
    if (weighed.some((other) => sameWords(other.reading, reading))) continue;
    const findings = refuted.get(call);
    const because = contradictsPagingRecord(reading, reads) ? CONTRADICTED : contradictsOrderRecord(reading, recordSets) ? CONTRADICTED_ORDER
      : findings ? `contradicted by Core's record: ${findings.join(" ")}` : undefined;
    weighed.push({ call, verification, reading, contradicted: because !== undefined, ...(because ? { because } : {}) });
  }
  if (!weighed.some((one) => one.contradicted) && weighed.length < 2) return weighed[0]?.verification ?? first;
  const ordered = [...weighed.filter((one) => !one.contradicted), ...weighed.filter((one) => one.contradicted)];
  const lead = ordered[0]!.verification;
  const labelled = (field: "expected" | "observed" | "advice"): string | undefined => {
    const saying = ordered.filter((one) => one.reading[field]);
    // A field both calls worded alike is said once, unlabelled.
    if (saying.length > 1 && saying.every((one) => one.reading[field] === saying[0]!.reading[field])) return saying[0]!.reading[field];
    const parts = saying.map((one) => `Judge call ${one.call}${one.because ? ` (${one.because})` : ""}: ${one.reading[field]}`);
    return parts.length ? parts.join(" ") : undefined;
  };
  const expected = labelled("expected");
  const observed = labelled("observed");
  const advice = labelled("advice");
  const stillAchievable = weighedStillAchievable(ordered);
  const checked = [...new Set([lead, first, second].flatMap((verification) => verification.repair?.checked ?? []))];
  const withheld = first.repair?.withheld === true || second.repair?.withheld === true;
  const repair = lead.repair ?? first.repair!;
  return {
    ...lead,
    repair: {
      ...repair,
      judgement: { ...(expected ? { expected } : {}), ...(observed ? { observed } : {}), ...(advice ? { advice } : {}), ...(stillAchievable ? { stillAchievable } : {}) },
      ...(checked.length ? { checked } : {}),
      ...(withheld ? { withheld: true } : {})
    }
  };
}

/** Whether two readings say the same words in every field. */
function sameWords(one: JudgeReading, other: JudgeReading): boolean {
  return one.expected === other.expected && one.observed === other.observed && one.advice === other.advice;
}

/**
 * Whether what was asked can still be had, by the readings the record does
 * not contradict (all of them where it contradicts every one): their word where
 * they agree, and otherwise the first that is not `no`, since a build ends
 * "not doable" only on `no` (t195-w37) and one reading saying it can be had is
 * reason enough not to.
 */
function weighedStillAchievable(ordered: readonly Weighed[]): JudgeReading["stillAchievable"] {
  const standing = ordered.some((one) => !one.contradicted) ? ordered.filter((one) => !one.contradicted) : ordered;
  const words = standing.map((one) => one.reading.stillAchievable).filter((word) => word !== undefined);
  if (!words.length) return undefined;
  return words.every((word) => word === words[0]) ? words[0] : words.find((word) => word !== "no");
}

/**
 * A reading's words that say a list has pages its read did not reach: more,
 * further, remaining or unread pages (never "no more" or "no further"), "not
 * every page", a read that stopped early, or a page bound to raise. Generic
 * words about paging only, never about any site or task.
 */
const MORE_PAGES = /(?<!\bno\s)(?<!\bno\s\w+\s)\b(?:more|further|remaining|additional|unread|later|subsequent)\s+pages?\b|\bnot\s+(?:every|all(?:\s+the)?)\s+pages?\b|\bstopped\s+(?:early|too\s+soon|before\s+the\s+(?:last|end))\b|\b(?:did\s+not|didn't)\s+(?:read|follow|reach)\s+(?:every|all|the\s+(?:last|remaining))\b|\b(?:increase|raise)\s+(?:the\s+)?(?:page\s+)?(?:limit|bound)\b/iu;

/**
 * Whether a reading says there are pages left unread where Core's own record
 * says otherwise: at least one read follows pages, and every one that does
 * says its list ended, with a stop word of the list's own and nothing cut
 * short (`read-account/stop.ts`). Without reads, or with any paging read the
 * record leaves open, nothing is contradicted.
 */
function contradictsPagingRecord(reading: JudgeReading, reads: readonly AutomationStudioResultReadAccount[] | undefined): boolean {
  const paging = pagingReads(reads);
  if (!paging.length) return false;
  const listEnded = paging.every((read) => read.stop !== undefined && !read.truncated && automationStudioResultReadStop(read) === "list_ended");
  if (!listEnded) return false;
  return [reading.expected, reading.observed, reading.advice].some((text) => typeof text === "string" && MORE_PAGES.test(text));
}

/** Whether a reading denies an order every record set's own sort reading says the rows have (`./value-readings/order-claim.ts`, t511). */
function contradictsOrderRecord(reading: JudgeReading, recordSets: readonly AutomationStudioResultRecordSetSummary[] | undefined): boolean {
  return [reading.expected, reading.observed, reading.advice].some((text) => automationStudioResultOrderClaimContradicted(text, recordSets));
}

/** Core's record of the judged result, built once per summary: what a no's reasons are weighed against (t607). */
const NO_RECORDS = new WeakMap<AutomationStudioRunResultSummary, { input: AutomationStudioResultVerificationAgreementInput; record: AutomationStudioResultNoRecord }>();

/** The record a no is weighed against, with the page and order claims this file checks itself; none without the summary. */
function noRecordOf(input: AutomationStudioResultVerificationAgreementInput): AutomationStudioResultNoRecord | undefined {
  const summary = input.summary;
  if (!summary) return undefined;
  const known = NO_RECORDS.get(summary);
  // The same record only for the same request, reads and record sets: a re-agreement after a re-ask passes them all on unchanged.
  if (known && known.input.requestText === input.requestText && known.input.wording === input.wording && known.input.reads === input.reads && known.input.recordSets === input.recordSets) return known.record;
  const reads = input.reads ?? summary.reads;
  const recordSets = input.recordSets ?? summary.recordSets;
  const record = automationStudioResultNoRecord({ summary, requestText: input.requestText, wording: input.wording, other: (sentence) => pageOrOrderClaim(sentence, reads, recordSets) });
  NO_RECORDS.set(summary, { input, record });
  return record;
}

/** Words that deny an order, for a claim the record does not contradict: such a claim still stands. */
const DENIES_ORDER = /\b(?:out\s+of\s+order|unsorted|wrong(?:ly)?\s+(?:sorted|ordered|order)|not\s+(?:sorted|ordered|in\s+(?:\w+\s+){0,2}order)|(?:sort|order)\s+(?:is|was)\s+(?:wrong|incorrect|reversed))\b/iu;

/** A sentence's claim about pages (t501) or order (t511), refuted where the record contradicts it, standing where it does not; nothing where it makes none. */
function pageOrOrderClaim(sentence: string, reads: readonly AutomationStudioResultReadAccount[] | undefined, recordSets: readonly AutomationStudioResultRecordSetSummary[] | undefined): AutomationStudioResultNoClaim | undefined {
  const reading = { observed: sentence };
  if (MORE_PAGES.test(sentence)) {
    return contradictsPagingRecord(reading, reads)
      ? { refuted: true, finding: pagingReads(reads).map((read) => `Read ${read.nodeId} read ${automationStudioResultReadPagesClause(read)}.`).join(" ") }
      : { refuted: false };
  }
  if (contradictsOrderRecord(reading, recordSets)) return { refuted: true, finding: "Core sorted the answer itself, and its sortRead says the rows are in that order." };
  return DENIES_ORDER.test(sentence) ? { refuted: false } : undefined;
}

/** What Core's record says of one call's no (t607), whether or not it refutes all of it; nothing without the summary, or for a call that did not say no. */
function weighedNo(input: AutomationStudioResultVerificationAgreementInput, call: 1 | 2): AutomationStudioResultNoWeighed | undefined {
  const record = noRecordOf(input);
  const verification = call === 1 ? input.first : input.second;
  if (!record || !verification || verification.basis !== "model" || verification.verdict !== "does_not_answer") return undefined;
  return automationStudioResultRefutedReading(verification.repair?.judgement, record);
}

/** Core's findings on each no among the two calls whose every reason its record refutes (t607); none without the summary. */
function refutedFindings(input: AutomationStudioResultVerificationAgreementInput): Map<1 | 2, string[]> {
  const found = new Map<1 | 2, string[]>();
  for (const call of [1, 2] as const) {
    const weighed = weighedNo(input, call);
    if (weighed?.wholly) found.set(call, weighed.findings);
  }
  return found;
}

/** `{ refutedNo }` naming those of `calls` whose no Core's record wholly refutes, to be asked once more (t607); nothing otherwise. */
function refutedMark(input: AutomationStudioResultVerificationAgreementInput, calls: ReadonlyArray<1 | 2>): { refutedNo?: NonNullable<AutomationStudioResultVerification["refutedNo"]> } {
  const found = refutedFindings(input);
  const marked = calls.filter((call) => found.has(call));
  // Beside a no the record leaves standing, a refuted no is only labelled: the standing one keeps the verdict no (t501).
  if (!marked.length || (calls.length === 2 && marked.length < 2)) return {};
  return { refutedNo: { calls: marked, findings: [...new Set(marked.flatMap((call) => found.get(call)!))] } };
}

/**
 * `{ standingNo }`: Core's record of a build test's double no (header, t633,
 * `./standing-no-record/record.ts`); nothing for a runtime check, or without the
 * judged summary.
 */
function standingNoOf(input: AutomationStudioResultVerificationAgreementInput): { standingNo?: AutomationStudioResultStandingNoRecord } {
  const record = input.confirmAnswer === true ? noRecordOf(input) : undefined;
  if (!record || !input.summary || !input.second) return {};
  const calls = [{ call: 1 as const, verification: input.first }, { call: 2 as const, verification: input.second }];
  return { standingNo: automationStudioResultStandingNoRecord({ calls, record, summary: input.summary, wording: input.wording }) };
}

/** The reads that follow pages: authored to, or read more than one page or loop pass. */
function pagingReads(reads: readonly AutomationStudioResultReadAccount[] | undefined): AutomationStudioResultReadAccount[] {
  return (reads ?? []).filter((read) => read.paginates === true || read.pagesRead > 1 || (read.keptPerPage?.length ?? 0) > 1);
}

/** Whether one call answered a plain yes: taken, or held for its exclusion evidence (header, t611). A yes that also said the Flow needs a change is not one. */
function answeredYes(call: AutomationStudioResultVerification): boolean {
  if (call.yesUnconfirmed === true) return true;
  return call.basis === "model" && call.verdict === "answers" && call.code === AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answers;
}
