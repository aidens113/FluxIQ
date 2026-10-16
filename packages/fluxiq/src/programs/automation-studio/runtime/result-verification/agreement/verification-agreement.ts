import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { agree } from "./agree.ts";
import { recorded } from "./standing-record.ts";
import type { AutomationStudioResultVerificationAgreementInput } from "./types.ts";

/**
 * The one verification a run records, from one or two calls.
 *
 * Every outcome carries `verdicts` (the verdict words, in the order asked) and
 * `calls`. A second verdict given for a first that is not asked again is
 * ignored.
 */
export function automationStudioResultVerificationAgreement(input: AutomationStudioResultVerificationAgreementInput): AutomationStudioResultVerification {
  return recorded(input, agree(input));
}
