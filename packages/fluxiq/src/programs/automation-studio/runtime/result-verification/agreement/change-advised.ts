import type { AutomationStudioResultVerification } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "../unsettled/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../verdict.ts";
import { answeredReadingOf } from "./yes-readings.ts";

/**
 * A runtime check's single yes that said the Flow needs a change (header,
 * t515): unsure and unconfirmed, keeping what the yes compared, with no
 * failure record and no repair, so it neither confirms nor fails the run.
 */
export function changeAdvised(first: AutomationStudioResultVerification): AutomationStudioResultVerification {
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
