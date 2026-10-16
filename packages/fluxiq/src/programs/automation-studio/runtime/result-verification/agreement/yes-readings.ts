import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../verdict/index.ts";

/** What a call that judged `answers` compared, copied; nothing for any other call or an empty reading. */
export function answeredReadingOf(verification: AutomationStudioResultVerification): NonNullable<AutomationStudioResultVerification["answeredReading"]> | undefined {
  if (verification.verdict !== "answers" || !verification.answeredReading) return undefined;
  const { expected, observed } = verification.answeredReading;
  const reading = { ...(expected ? { expected } : {}), ...(observed ? { observed } : {}) };
  return Object.keys(reading).length ? reading : undefined;
}

/** Whether a call answered yes and said the Flow needs a change: held for its exclusion evidence, or taken (t636). */
export function advisedChange(call: AutomationStudioResultVerification): boolean {
  return call.changeAdvised === true || (call.basis === "model" && call.verdict === "answers" && call.code === AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answersWithChangeAdvised);
}

/**
 * What a call that answered yes compared, as `answeredReading` (t636): first a
 * held yes that advised a change, with the change it named, then any held or
 * taken yes; nothing where neither answered yes.
 */
export function yesReading(first: AutomationStudioResultVerification, second: AutomationStudioResultVerification): { answeredReading?: NonNullable<AutomationStudioResultVerification["answeredReading"]> } {
  const advised = [first, second].find((call) => call.changeAdvised && call.answeredReading);
  if (advised?.answeredReading) {
    const { expected, observed, advice } = advised.answeredReading;
    return { answeredReading: { ...(expected ? { expected } : {}), ...(observed ? { observed } : {}), ...(advice ? { advice } : {}) } };
  }
  const reading = [first, second].map((call) => answeredReadingOf(call.exclusionEvidenceMissing ? { ...call, verdict: "answers" } : call)).find((found) => found !== undefined);
  return reading ? { answeredReading: reading } : {};
}

/** Whether one call answered a plain yes: taken, or held for its exclusion evidence (header, t611). A yes that also said the Flow needs a change is not one. */
export function answeredYes(call: AutomationStudioResultVerification): boolean {
  if (call.yesUnconfirmed === true) return true;
  return call.basis === "model" && call.verdict === "answers" && call.code === AUTOMATION_STUDIO_RESULT_VERDICT_CODES.answers;
}
