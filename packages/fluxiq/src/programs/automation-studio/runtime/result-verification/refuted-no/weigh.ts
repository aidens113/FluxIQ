// A no is only as good as what it names (t607).
//
// **Why.** A8 everything-store `run-mv8p0p7c-c8412344`: a Flow that stored
// exactly the rows asked for was failed because three of four whole-test judge
// calls said no on the same evidence a subflow trial had accepted. Each no made
// a claim Core's own record refutes -- two distinct stored listings "the same
// pair", a sponsored, unmarked row "qualifying" -- and Core took each at face
// value, while a yes is held to quoting the request beside every row.
//
// **The rule.** A no's `observed` is where the judge is told to say which rows
// are wrong or missing (its `expected` restates the request, its advice rests
// on what it observed), so each of its sentences is read for the claims Core
// can check against its record: rows called one and the same
// (`./duplicate-claim.ts`), rows called missing (`./missing-claim.ts`), a
// stored row called an excluded kind of thing its own words say it is not
// (`./excluded-kind-claim.ts`), the result's count (`./count-claim.ts`), a
// left-out row given a value Core read otherwise (`./value-claim.ts`, t629), and
// the pages and order the agreement checks itself (`record.other`).
//
// - A sentence making claims is refuted when Core's record refutes every one.
// - A sentence making none still stands as a reason of its own where it says
//   something is wrong (`NEGATIVE`) of something Core can name: a row, a
//   condition by its number, a step by its node id, or a row Core cannot find.
// - Any other sentence names nothing, and rests on the sentences around it.
//
// Each sentence is read without Core's own wording of the conditions it
// names (`./condition-wording.ts`, t624): `condition 1 (sponsored is absent)`
// is no claim that rows are absent, and "Keep condition 4 (name not contains
// Holder)" says nothing is wrong. So a sentence that only keeps a condition is
// neither refuted nor a reason that stands.
//
// **What a no references comes first (t631).** A8 bigbox `run-mv9gbsm5-2957581c`:
// the wording lists above missed a new phrasing in three waves running, so a no
// is weighed first by what it references, which Core can resolve whatever the
// words:
//
// - its advice, where it changes, removes or loosens only conditions Core names
//   by number (`./advice-condition.ts`): when Core's account shows that each
//   brings back no row the request could ask for, that is a refuted claim of
//   its own, and every sentence of `observed` that names only conditions (no
//   row, no row Core cannot find, no step but those conditions' reads) is its
//   reason, refuted with it;
// - the rows a sentence names, by Core's row id or a row's own label
//   (`./row-reference-claim.ts`): refuted where every one failed the request's
//   own words by the value Core read, standing where Core did not settle one.
//
// The wording claims above remain the fallback, for the sentences whose
// references alone settle nothing.
//
// **And what Core measured of the steps before a read (t659).** A8 frozen pair 6
// candidate towels `run-mvac1av6-f7b0f9e2`: two nos blamed a step after which
// the page stated as many results as before it. A sentence blaming only such
// steps (`./unseen-row-claim.ts`), and advice that only removes or replaces
// them (`./advice-condition.ts`), are refuted claims, where Core measured of each
// step that it only added a choice and removed no row. And each sentence's
// words for missing count only for their own clause; a stored row a clause
// says the result keeps, beside rows called missing, is a reason Core cannot
// refute (`./missing-claim.ts`, t659), so such a reading
// is at most partly contradicted.
//
// **Clause by clause, where a step Core measured is blamed (t665).** A8 frozen
// pair 8 candidate towels `run-mvam0lys-2d3eb090` step 0043, over the exact
// answer: "But the '4 & up' rating filter (<node>) keeps 4.0-4.4 items the
// request excludes, and the read's condition 3 correctly drops them;
// conversely the site filter's count (16) is not the request's cohort." Core
// measured that step as removing no row (16 results before it, 16 after), but
// a sentence that also names a condition is never read as blaming only a step,
// so it stood on its "not", and an exact revision was banned. So where one
// clause of a sentence (`automationStudioResultReasonClauses`: cut at ";",
// ": ", ", but" and ", and ", outside quotes) blames only steps Core measured
// as removing no row, the sentence is weighed clause by clause, each clause as
// a sentence of its own: that clause is refuted; a clause that names only
// conditions and says nothing is wrong of them in its own words is no reason; a
// clause naming a row or another step says something is wrong where its
// sentence does, so no row a sentence names is weighed less than before; a
// clause naming nothing rests on its neighbours; and any clause that stands,
// stands for the sentence. A sentence weighed whole as refuted stays so.
//
// **A row said rightly left out is no reason (t665).** The same reading, read
// whole: "Condition 3 left out '<A>' (4.3) and '<B>' (4.4), correctly excluded."
// It agrees with Core's record and says nothing is wrong, yet stood on
// "excluded". Words that say a row was correctly, rightly or properly left out
// say that much only, so they are set aside before a sentence is asked whether
// it says something is wrong; any other word for wrong in it still counts.
//
// **Rows said to have come back are no reason (live-lane-1 fix 4).** Run
// `run-mvd8ypsv-32cde667` steps 0056 and 0057, over an exact answer: "Condition
// 1 left out 5 rows, but 4 of them (...) are also in the result via another
// copy, so not missing." Each row it names is a stored row a condition also
// left a copy of, so it agrees with Core's record, yet it named a condition and
// rows and said "but", "not" and "missing", so it stood beside the one refuted
// sentence calling a settled row absent -- the no's only complaint -- neither no
// was wholly refuted or asked again, and the run ended unverified. So each
// sentence is weighed without its clauses (`automationStudioResultReasonClauses`)
// that only grant that rows came back: every row the clause names is a stored
// row of which a condition also left a copy out, it names no left-out row and
// no row Core cannot find, it says the result holds them (`IN_RESULT`: "is also
// in the result", "are among the stored rows", "not missing", "came back"), and
// once those words and a leading "but" are set aside nothing in it says
// something is wrong. The rest of the sentence is weighed as before; a sentence
// that is nothing else names nothing. A clause that grants a row came back and
// says anything else of it ("... is in the result but is not the item asked
// for") is kept, and so is one naming a row no condition left a copy of. And
// "wrongly" is a word for wrong, as "wrong" is.
//
// The reading is wholly refuted when at least one sentence's claims are
// refuted and no sentence stands. A reading that names nothing Core can check,
// or anything Core cannot refute, is not: the no stands as before. Core never
// turns a no into a yes from this; `./reask.ts` asks the call once more, and a
// no still refuted is taken as unsure.

import type { AutomationStudioResultRepairDirective } from "../contracts/index.ts";
import { automationStudioResultAdviceConditions, automationStudioResultAdviceSteps } from "./advice-condition.ts";
import { automationStudioResultConditionReferences } from "./condition-references.ts";
import { automationStudioResultWithoutConditionWording } from "./condition-wording.ts";
import { automationStudioResultCountClaim } from "./count-claim.ts";
import { automationStudioResultDuplicateClaim } from "./duplicate-claim.ts";
import { automationStudioResultExcludedKindClaim } from "./excluded-kind-claim.ts";
import { automationStudioResultKeptRowClaim, automationStudioResultMissingClaim, automationStudioResultReasonClauses } from "./missing-claim.ts";
import { automationStudioResultSentenceRows } from "./named-rows.ts";
import { automationStudioResultNodeIdsSaid } from "./node-ids.ts";
import { automationStudioResultRowReferenceClaim } from "./row-reference-claim.ts";
import { automationStudioResultReadingSentences } from "./sentences.ts";
import { automationStudioResultValueClaim } from "./value-claim.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoRecord, AutomationStudioResultNoWeighed } from "./types.ts";
import { automationStudioResultNarrowingStepClaim, automationStudioResultNarrowingStepsNamed } from "./unseen-row-claim.ts";

/** Words that say something is wrong. */
const NEGATIVE = /\b(?:not|no|never|none|nothing|missing|absent|wrong(?:ly)?|incorrect(?:ly)?|fails?|failed|failing|instead|should|must|but|however|although|lacks?|lacking|without|exclud\w*|duplicat\w*|twice|extra|too\s+(?:many|few)|only)\b|n['’]t\b/iu;
/** A condition named by its number, as Core names it. */
const CONDITION_NUMBER = /\bcondition\s+\d+\b/iu;

/** A reading of a no, as its directive carries it. */
type Reading = NonNullable<AutomationStudioResultRepairDirective["judgement"]>;

/** Words that say a row was left out as it should be: no word that something is wrong (header, t665). Generic, never any site's. */
const APPROVED = /\b(?:correctly|rightly|properly|appropriately|validly|legitimately|accurately)\s+(?:been\s+)?(?:excluded|dropped|left\s+out|removed|rejected|filtered\s+out|omitted|skipped)\b|\b(?:excluded|dropped|left\s+out|removed|rejected|filtered\s+out|omitted|skipped)\s+(?:correctly|rightly|properly|appropriately|validly|legitimately|accurately)\b/giu;

/** Words that say the rows named are in the result (header, live-lane-1 fix 4). Generic, never any site's. */
const IN_RESULT = /\b(?:is|are|was|were)\s+(?:also\s+|still\s+)?(?:in|among|part\s+of)\s+the\s+(?:result|stored\s+rows|answer|output|table)\b|\b(?:is|are|was|were)\s+(?:also\s+|still\s+)?(?:kept|stored|returned)\b|\b(?:so\s+)?(?:not|never)\s+missing\b|\bcame\s+back\b/giu;
/** A contrast word a clause cut at ", but" begins with: it sets the clause against the one before, and says nothing of its own rows. */
const LEADING_CONTRAST = /^\s*(?:but|however|yet|though|although)\b,?/iu;

/** The sentence less each clause that only grants that rows a condition left out came back (header, live-lane-1 fix 4); the sentence itself where it has none. */
function withoutRowsInResult(sentence: string, record: AutomationStudioResultNoRecord): string {
  let rest = sentence;
  for (const clause of automationStudioResultReasonClauses(sentence)) if (grantsRowsBack(clause, record)) rest = rest.replace(clause, " ");
  return rest === sentence ? sentence : rest.replace(/\s+/gu, " ").trim();
}

/** Whether one clause only grants that rows a condition left out came back (header, live-lane-1 fix 4). */
function grantsRowsBack(clause: string, record: AutomationStudioResultNoRecord): boolean {
  if (!clause.match(IN_RESULT)) return false;
  const named = automationStudioResultSentenceRows(clause, record);
  if (!named.stored.length || named.leftOut.length || named.unmatched) return false;
  if (!named.stored.every((row) => record.leftOut.some((left) => left.label === row.label))) return false;
  return !saysWrong(clause.replace(IN_RESULT, " ").replace(LEADING_CONTRAST, " "));
}

/** Whether a text says something is wrong, once words that say a row was rightly left out are set aside (header, t665). */
function saysWrong(text: string): boolean {
  return NEGATIVE.test(text.replace(APPROVED, " "));
}

/** How one sentence, or one clause of one, weighs: refuted, a reason that stands, or neither. */
type Weight = "refuted" | "standing" | "none";

/** The conditions a no's advice is refuted on, where Core's record clears them (header, t631). */
type Advised = ReturnType<typeof automationStudioResultAdviceConditions>;

/** What Core's record says of a no's reading (header). */
export function automationStudioResultRefutedReading(reading: Reading | undefined, record: AutomationStudioResultNoRecord): AutomationStudioResultNoWeighed {
  const findings: string[] = [];
  let refuted = 0;
  let standing = false;
  // The conditions its advice changes, where Core's record clears every one (header, t631).
  const advised = automationStudioResultAdviceConditions(reading?.advice, record);
  // The narrowing steps its advice removes or replaces, where Core measured each removed no row (header, t659).
  const advisedSteps = automationStudioResultAdviceSteps(reading?.advice, record);
  // Each sentence less Core's own wording of the conditions it names: those are Core's words, not the judge's claim (`./condition-wording.ts`, t624).
  // And without its clauses that only grant that rows a condition left out came back (header, live-lane-1 fix 4).
  for (const sentence of automationStudioResultReadingSentences(reading?.observed).map(automationStudioResultWithoutConditionWording).map((each) => withoutRowsInResult(each, record))) {
    const whole = weighed(sentence, record, advised);
    // Clause by clause, where a clause blames only steps Core measured as removing no row (header, t665).
    const clauses = whole.weight === "refuted" ? undefined : byClause(sentence, record, advised);
    const weight = (clauses ?? whole).weight;
    for (const finding of (clauses ?? whole).findings) if (!findings.includes(finding)) findings.push(finding);
    if (weight === "refuted") refuted += 1;
    else if (weight === "standing") standing = true;
  }
  for (const cleared of [advised, advisedSteps]) {
    if (!cleared) continue;
    refuted += 1;
    for (const finding of cleared.findings) if (!findings.includes(finding)) findings.push(finding);
  }
  return { wholly: refuted > 0 && !standing, findings };
}

/**
 * How one sentence weighs, and Core's findings on the claims of it Core refuted
 * (header). `around`, for a clause, is its whole sentence: a clause naming a row
 * or a step says something is wrong where its sentence does, and only a clause
 * naming conditions alone is held to its own words (header, t665).
 */
function weighed(sentence: string, record: AutomationStudioResultNoRecord, advised: Advised, around?: string): { weight: Weight; findings: string[] } {
  const named = automationStudioResultSentenceRows(sentence, record);
  const excludedKind = automationStudioResultExcludedKindClaim(sentence, named, record);
  const claims = [
    automationStudioResultDuplicateClaim(sentence, named, record),
    automationStudioResultMissingClaim(sentence, named, record),
    excludedKind,
    // A stored row a clause says is kept, beside rows called missing: about what the row is (header, t659).
    excludedKind === undefined ? automationStudioResultKeptRowClaim(sentence, record) : undefined,
    automationStudioResultCountClaim(sentence, named, record),
    automationStudioResultValueClaim(sentence, named),
    record.other?.(sentence),
    // The rows it names, whatever its words (`./row-reference-claim.ts`, t631).
    automationStudioResultRowReferenceClaim(sentence, named),
    // A step Core measured as removing no row (header, t659).
    automationStudioResultNarrowingStepClaim(sentence, named, record)
  ].filter((claim): claim is AutomationStudioResultNoClaim => claim !== undefined);
  const findings = claims.flatMap((claim) => (claim.refuted && claim.finding ? [claim.finding] : []));
  if (claims.length) return { weight: claims.every((claim) => claim.refuted) ? "refuted" : "standing", findings };
  const conditions = automationStudioResultConditionReferences(sentence);
  const steps = automationStudioResultNodeIdsSaid(sentence, record.nodeIds).ids;
  const namesRows = named.stored.length > 0 || named.leftOut.length > 0 || named.unmatched;
  // A sentence naming only conditions is the reason for an advice Core's record refutes (header, t631).
  if (advised && conditions.length && !namesRows && steps.every((step) => advised.nodeIds.includes(step))) {
    return { weight: NEGATIVE.test(sentence) ? "refuted" : "none", findings };
  }
  const namesSomething = namesRows || conditions.length > 0 || CONDITION_NUMBER.test(sentence) || record.nodeIds.some((nodeId) => sentence.includes(nodeId));
  const conditionsAlone = !namesRows && !steps.length && !automationStudioResultNarrowingStepsNamed(sentence, record).steps.length;
  const said = around !== undefined && !conditionsAlone ? around : sentence;
  // A row said rightly left out says nothing is wrong (header, t665).
  return { weight: namesSomething && saysWrong(said) ? "standing" : "none", findings };
}

/**
 * A sentence weighed clause by clause (header, t665), where one clause blames
 * only steps Core measured as removing no row; nothing where none does.
 */
function byClause(sentence: string, record: AutomationStudioResultNoRecord, advised: Advised): { weight: Weight; findings: string[] } | undefined {
  if (!record.narrowing?.steps.length) return undefined;
  const clauses = automationStudioResultReasonClauses(sentence);
  if (clauses.length < 2) return undefined;
  const blamesAStep = clauses.some((clause) => automationStudioResultNarrowingStepClaim(clause, automationStudioResultSentenceRows(clause, record), record)?.refuted === true);
  if (!blamesAStep) return undefined;
  const weights = clauses.map((clause) => weighed(clause, record, advised, sentence));
  const weight: Weight = weights.some((each) => each.weight === "standing") ? "standing" : weights.some((each) => each.weight === "refuted") ? "refuted" : "none";
  return { weight, findings: weights.flatMap((each) => each.findings) };
}
