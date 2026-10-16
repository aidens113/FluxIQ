import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES } from "../repair-directive.ts";

/** An answer in Core's own words, as it finishes "the first was ...". */
export function said(verification: AutomationStudioResultVerification): string {
  if (verification.basis === "model_unavailable") return "no answer, because the check did not come back usable";
  if (verification.basis === "model_silent") return "no answer, because the reply gave none";
  if (verification.verdict === "does_not_answer" && passedOverRows(verification)) return "that it does what was asked, without saying why the rows a condition alone left out that name the item asked for are excluded";
  // A yes `../verdict.ts` did not take for want of the request's own words beside a left-out row (t515): its reason, Core's, says so.
  if (verification.verdict === "does_not_answer" && verification.repair?.judgement === undefined && verification.reason.includes("without quoting")) return "that it does what was asked, without quoting the request's words that exclude each row a condition alone left out";
  if (verification.verdict === "does_not_answer") return "that it does not do what was asked";
  if (verification.verdict === "answers") return "that it does what was asked";
  return "that it could not be told";
}

/** Whether a `does_not_answer` is a yes Core did not take (`../verdict.ts`): it carries that finding and no reading of its own. */
function passedOverRows(verification: AutomationStudioResultVerification): boolean {
  return verification.repair?.judgement === undefined
    && (verification.repair?.findings ?? []).some((finding) => finding.code === AUTOMATION_STUDIO_RESULT_REPAIR_FINDING_CODES.leftOutNamingTheItem);
}
