// A held yes's advice, kept across its recheck (t636).
//
// **Why.** A yes that said the Flow needs a change (`patchNeeded: true`) and
// lacked its exclusion evidence is held, not turned into a no
// (`../verdict.ts`), and asked again with the recheck (`../verify.ts`). The
// recheck is a new reply, which may say nothing of a change; taken alone, its
// yes would read as a clean pass, and a runtime check's single yes would be
// confirmed over a first reply that advised a change. So the call keeps the
// advice: a taken yes is coded `answersWithChangeAdvised`, as the first reply
// would have been with its quote (`../agreement/` does not confirm a single
// such yes), and a yes held again is `changeAdvised`, not a plain yes, and
// carries the change the earlier ask named where its own reply named none.

import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../verdict.ts";

/**
 * The verification an asked call ends with, once `earlier`, an earlier ask of
 * the same call, was a held yes that advised a change (header).
 */
export function automationStudioResultAdviceKept(verification: AutomationStudioResultVerification, earlier: AutomationStudioResultVerification): AutomationStudioResultVerification {
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  if (verification.basis === "model" && verification.verdict === "answers" && verification.code === codes.answers) return { ...verification, code: codes.answersWithChangeAdvised };
  if (!verification.exclusionEvidenceMissing) return verification;
  const { yesUnconfirmed: _plain, ...held } = verification;
  const advice = verification.answeredReading?.advice ?? earlier.answeredReading?.advice;
  return { ...held, changeAdvised: true, ...(advice ? { answeredReading: { ...verification.answeredReading, advice } } : {}) };
}
