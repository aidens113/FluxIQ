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

import type { AutomationStudioResultReadAccount, AutomationStudioResultVerdict, AutomationStudioResultVerification } from "./contracts.ts";
import { automationStudioResultReadPagesClause, automationStudioResultReadStop } from "./read-account/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "./repair-directive.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "./unsettled/index.ts";
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
};

/** How a verification reads a first answer: whether a `yes` is confirmed too. */
export type AutomationStudioResultVerificationAskAgainOptions = { confirmAnswer?: boolean | undefined };

/**
 * Whether a first verdict is asked once more: the model answered, and did not
 * answer `yes` -- or did, and the verification confirms answers. A reply that
 * carried no verdict and a call that never came back are not asked again.
 */
export function automationStudioResultVerificationAskAgain(first: AutomationStudioResultVerification, options: AutomationStudioResultVerificationAskAgainOptions = {}): boolean {
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
  const { first, second } = input;
  if (!second && first.basis === "model" && first.verdict === "answers" && input.confirmAnswer === true) {
    return { schemaVersion: first.schemaVersion, verdict: "unsure", basis: "model_unconfirmed", code: AUTOMATION_STUDIO_RESULT_VERDICT_CODES.unconfirmed, reason: `This result was checked once: the first answer was that it does what was asked, but the required confirming check was not supplied. ${UNSETTLED.model_unconfirmed.run}`, observation: first.observation, verdicts: [first.verdict], calls: 1 };
  }
  if (!second || !automationStudioResultVerificationAskAgain(first, { confirmAnswer: input.confirmAnswer })) return { ...first, verdicts: [first.verdict], calls: 1 };
  const verdicts: AutomationStudioResultVerdict[] = [first.verdict, second.verdict];
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  if (first.verdict === "answers") {
    // A confirmation that never came back usable confirms nothing (run-mux6nxst-c9bca37c): the yes is unconfirmed.
    if (second.basis === "model_unavailable") {
      return unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked once: the first answer was that it does what was asked, and the second check, which confirms a yes, gave no answer, because it did not come back usable (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts);
    }
    if (second.verdict === "answers") return { ...first, verdicts, calls: 2 };
    if (second.verdict !== "does_not_answer") {
      return { ...unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked twice with the same evidence: the first answer was that it does what was asked, and the confirming check gave ${said(second)} (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts), ...contradictedUnsure(2, second, input.reads) };
    }
    return unsettled(first, second, "model_disagreed", codes.disagree, `This result was checked twice with the same evidence, and the answers differed: the first was that it does what was asked, the second that it does not. ${UNSETTLED.model_disagreed.run}`, verdicts);
  }
  if (first.verdict === "does_not_answer" && second.verdict === "does_not_answer") {
    // Both readings, each its own call's and labelled so (`bothReadings`):
    // two calls with the same evidence reach identical Core findings, but their
    // prose can name different defects. Live run `run-mv6i27oi-a87fb247` (D1):
    // the first blamed paging against the record, the second named the two
    // stored rows that were wrong, and only the first was forwarded.
    return {
      ...bothReadings(first, second, input.reads),
      // Nothing about the steps: this file reads only the two verdicts, and a
      // build's test can pass with a step it excused failing. "Although every
      // step of the run succeeded" was said above "Step 15 (×) failed" (t193
      // 1002-M, `run-murzln6g-11debe1d`, C6).
      reason: "The result was judged not to answer the request the Flow was built for, twice and with the same evidence.",
      verdicts,
      calls: 2
    };
  }
  if (second.verdict === "answers") {
    return { ...unsettled(first, second, "model_disagreed", codes.disagree, `This result was checked twice with the same evidence, and the answers differed: the first was ${said(first)}, the second that it does. ${UNSETTLED.model_disagreed.run}`, verdicts), ...contradictedUnsure(1, first, input.reads) };
  }
  return unsettled(first, second, "model_unconfirmed", codes.unconfirmed, `This result was checked twice with the same evidence, and neither answer was that it does what was asked, nor were both that it does not: the first was ${said(first)}, the second ${said(second)} (${second.code}). ${UNSETTLED.model_unconfirmed.run}`, verdicts);
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
  ask: (recheck: string) => Promise<AutomationStudioResultVerification>;
}): Promise<AutomationStudioResultVerification> {
  const { settled, second } = input;
  const marked = settled.contradictedUnsure;
  if (!marked || marked.reasked || !second) return settled;
  const reasked = await input.ask(recheckWords(marked.record));
  const verdicts: AutomationStudioResultVerdict[] = [...(settled.verdicts ?? []), reasked.verdict];
  const done = { call: marked.call, record: marked.record, reasked: true as const };
  if (reasked.basis !== "model") return { ...settled, verdicts, calls: 3, contradictedUnsure: done };
  const again = automationStudioResultVerificationAgreement({ ...input, first: marked.call === 1 ? reasked : input.first, second: marked.call === 2 ? reasked : second });
  return { ...again, verdicts, calls: 3, contradictedUnsure: done };
}

/** What a call asked again is told (header, t503): Core's words, naming no site or task. */
function recheckWords(record: string): string {
  return "This same evidence was judged before, and that answer could not tell because it took the list to have pages its read never reached. "
    + `Core's own record of each paging read says otherwise: ${record} `
    + "Answer again from the evidence, holding any reading about pages to that record; answer unknown only for a doubt the record does not settle.";
}

/**
 * `{ contradictedUnsure }` when `verification` is an unsure a model gave whose
 * doubt speaks of pages left unread where every paging read's record says its
 * list ended (`contradictsPagingRecord`), naming the record; nothing otherwise.
 */
function contradictedUnsure(call: 1 | 2, verification: AutomationStudioResultVerification, reads: readonly AutomationStudioResultReadAccount[] | undefined): { contradictedUnsure?: NonNullable<AutomationStudioResultVerification["contradictedUnsure"]> } {
  const doubt = verification.verdict === "unsure" && verification.basis === "model" ? verification.unsureReading : undefined;
  if (!doubt || !contradictsPagingRecord(doubt, reads)) return {};
  const record = pagingReads(reads).map((read) => `Read ${read.nodeId} read ${automationStudioResultReadPagesClause(read)}.`).join(" ");
  return { contradictedUnsure: { call, record } };
}

/** An answer in Core's own words, as it finishes "the first was ...". */
function said(verification: AutomationStudioResultVerification): string {
  if (verification.basis === "model_unavailable") return "no answer, because the check did not come back usable";
  if (verification.basis === "model_silent") return "no answer, because the reply gave none";
  if (verification.verdict === "does_not_answer" && passedOverRows(verification)) return "that it does what was asked, without saying why the rows a condition alone left out that name the item asked for are excluded";
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
  verdicts: AutomationStudioResultVerdict[]
): AutomationStudioResultVerification {
  const reading = unconfirmedReading(first) ?? unconfirmedReading(second);
  const answered = basis === "model_disagreed" ? answeredReadingOf(first) ?? answeredReadingOf(second) : undefined;
  return { schemaVersion: first.schemaVersion, verdict: "unsure", basis, code, reason, observation: first.observation, verdicts, calls: 2, ...(reading ? { unconfirmedReading: reading } : {}), ...(answered ? { answeredReading: answered } : {}) };
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

/** One call's reading as the repair is told it, and whether Core's record contradicts it. */
type Weighed = { call: 1 | 2; verification: AutomationStudioResultVerification; reading: JudgeReading; contradicted: boolean };

/** What a reading marked contradicted says of itself, after its call's number. */
const CONTRADICTED = "contradicted by Core's record: every read's own account says its list ended with no further page, so what this reading says about more pages is mistaken";

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
function bothReadings(first: AutomationStudioResultVerification, second: AutomationStudioResultVerification, reads: readonly AutomationStudioResultReadAccount[] | undefined): AutomationStudioResultVerification {
  const weighed: Weighed[] = [];
  for (const [call, verification] of [[1, first], [2, second]] as const) {
    const reading = verification.repair?.judgement;
    if (!reading || !(reading.expected || reading.observed || reading.advice)) continue;
    if (weighed.some((other) => sameWords(other.reading, reading))) continue;
    weighed.push({ call, verification, reading, contradicted: contradictsPagingRecord(reading, reads) });
  }
  if (!weighed.some((one) => one.contradicted) && weighed.length < 2) return weighed[0]?.verification ?? first;
  const ordered = [...weighed.filter((one) => !one.contradicted), ...weighed.filter((one) => one.contradicted)];
  const lead = ordered[0]!.verification;
  const labelled = (field: "expected" | "observed" | "advice"): string | undefined => {
    const saying = ordered.filter((one) => one.reading[field]);
    // A field both calls worded alike is said once, unlabelled.
    if (saying.length > 1 && saying.every((one) => one.reading[field] === saying[0]!.reading[field])) return saying[0]!.reading[field];
    const parts = saying.map((one) => `Judge call ${one.call}${one.contradicted ? ` (${CONTRADICTED})` : ""}: ${one.reading[field]}`);
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

/** The reads that follow pages: authored to, or read more than one page or loop pass. */
function pagingReads(reads: readonly AutomationStudioResultReadAccount[] | undefined): AutomationStudioResultReadAccount[] {
  return (reads ?? []).filter((read) => read.paginates === true || read.pagesRead > 1 || (read.keptPerPage?.length ?? 0) > 1);
}
