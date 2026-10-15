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
// (`./excluded-kind-claim.ts`), the result's count (`./count-claim.ts`), and
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
// The reading is wholly refuted when at least one sentence's claims are
// refuted and no sentence stands. A reading that names nothing Core can check,
// or anything Core cannot refute, is not: the no stands as before. Core never
// turns a no into a yes from this; `./reask.ts` asks the call once more, and a
// no still refuted is taken as unsure.

import type { AutomationStudioResultRepairDirective } from "../contracts.ts";
import { automationStudioResultWithoutConditionWording } from "./condition-wording.ts";
import { automationStudioResultCountClaim } from "./count-claim.ts";
import { automationStudioResultDuplicateClaim } from "./duplicate-claim.ts";
import { automationStudioResultExcludedKindClaim } from "./excluded-kind-claim.ts";
import { automationStudioResultMissingClaim } from "./missing-claim.ts";
import { automationStudioResultSentenceRows } from "./named-rows.ts";
import { automationStudioResultReadingSentences } from "./sentences.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoRecord, AutomationStudioResultNoWeighed } from "./types.ts";

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
  // Each sentence less Core's own wording of the conditions it names: those are Core's words, not the judge's claim (`./condition-wording.ts`, t624).
  for (const sentence of automationStudioResultReadingSentences(reading?.observed).map(automationStudioResultWithoutConditionWording)) {
    const named = automationStudioResultSentenceRows(sentence, record);
    const claims = [
      automationStudioResultDuplicateClaim(sentence, named, record),
      automationStudioResultMissingClaim(sentence, named),
      automationStudioResultExcludedKindClaim(sentence, named, record),
      automationStudioResultCountClaim(sentence, named, record),
      record.other?.(sentence)
    ].filter((claim): claim is AutomationStudioResultNoClaim => claim !== undefined);
    for (const claim of claims) if (claim.refuted && claim.finding && !findings.includes(claim.finding)) findings.push(claim.finding);
    if (claims.length) {
      if (claims.every((claim) => claim.refuted)) refuted += 1;
      else standing = true;
      continue;
    }
    const namesSomething = named.stored.length > 0 || named.leftOut.length > 0 || named.unmatched || CONDITION_NUMBER.test(sentence) || record.nodeIds.some((nodeId) => sentence.includes(nodeId));
    if (namesSomething && NEGATIVE.test(sentence)) standing = true;
  }
  return { wholly: refuted > 0 && !standing, findings };
}
