import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { automationStudioResultSiteChangeHeld } from "../site-change/index.ts";
import { agree } from "./agree.ts";
import { recorded } from "./standing-record.ts";
import type { AutomationStudioResultVerificationAgreementInput } from "./types.ts";

/**
 * The one verification a run records, from one or two calls.
 *
 * Every outcome carries `verdicts` (the verdict words, in the order asked) and
 * `calls`. A second verdict given for a first that is not asked again is
 * ignored.
 *
 * A yes over a trial whose change, as Core read it just before and just after
 * the trial, does not prove a part with a typed effect -- `no_change`,
 * `already_in_end_state` or `unproven` in the judged summary's `siteChange`
 * (t775, `../site-change/held.ts`) -- is not taken: unsure, the reason naming
 * the part and its proof. The verification's later re-asks agree through
 * here, and `./reask-contradicted.ts` holds what its own re-asks come to the
 * same way, so a yes a re-ask brings back is never taken over such a part.
 */
export function automationStudioResultVerificationAgreement(input: AutomationStudioResultVerificationAgreementInput): AutomationStudioResultVerification {
  return recorded(input, automationStudioResultSiteChangeHeld(agree(input), input.summary));
}
