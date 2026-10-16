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
import { automationStudioResultKeptRowClaim, automationStudioResultMissingClaim } from "./missing-claim.ts";
import { automationStudioResultSentenceRows } from "./named-rows.ts";
import { automationStudioResultNodeIdsSaid } from "./node-ids.ts";
import { automationStudioResultRowReferenceClaim } from "./row-reference-claim.ts";
import { automationStudioResultReadingSentences } from "./sentences.ts";
import { automationStudioResultValueClaim } from "./value-claim.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoRecord, AutomationStudioResultNoWeighed } from "./types.ts";
import { automationStudioResultNarrowingStepClaim } from "./unseen-row-claim.ts";

/** Words that say something is wrong. */
const NEGATIVE = /\b(?:not|no|never|none|nothing|missing|absent|wrong|incorrect(?:ly)?|fails?|failed|failing|instead|should|must|but|however|although|lacks?|lacking|without|exclud\w*|duplicat\w*|twice|extra|too\s+(?:many|few)|only)\b|n['’]t\b/iu;
/** A condition named by its number, as Core names it. */
const CONDITION_NUMBER = /\bcondition\s+\d+\b/iu;

/** A reading of a no, as its directive carries it. */
type Reading = NonNullable<AutomationStudioResultRepairDirective["judgement"]>;

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
  for (const sentence of automationStudioResultReadingSentences(reading?.observed).map(automationStudioResultWithoutConditionWording)) {
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
    for (const claim of claims) if (claim.refuted && claim.finding && !findings.includes(claim.finding)) findings.push(claim.finding);
    if (claims.length) {
      if (claims.every((claim) => claim.refuted)) refuted += 1;
      else standing = true;
      continue;
    }
    const conditions = automationStudioResultConditionReferences(sentence);
    const steps = automationStudioResultNodeIdsSaid(sentence, record.nodeIds).ids;
    const namesRows = named.stored.length > 0 || named.leftOut.length > 0 || named.unmatched;
    // A sentence naming only conditions is the reason for an advice Core's record refutes (header, t631).
    if (advised && conditions.length && !namesRows && steps.every((step) => advised.nodeIds.includes(step))) {
      if (NEGATIVE.test(sentence)) refuted += 1;
      continue;
    }
    const namesSomething = namesRows || conditions.length > 0 || CONDITION_NUMBER.test(sentence) || record.nodeIds.some((nodeId) => sentence.includes(nodeId));
    if (namesSomething && NEGATIVE.test(sentence)) standing = true;
  }
  for (const cleared of [advised, advisedSteps]) {
    if (!cleared) continue;
    refuted += 1;
    for (const finding of cleared.findings) if (!findings.includes(finding)) findings.push(finding);
  }
  return { wholly: refuted > 0 && !standing, findings };
}
