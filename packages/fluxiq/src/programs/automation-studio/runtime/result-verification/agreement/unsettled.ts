import type { AutomationStudioResultVerdict, AutomationStudioResultVerification } from "../contracts/index.ts";
import type { AutomationStudioResultNoRecord, AutomationStudioResultNoWeighed } from "../refuted-no/index.ts";
import type { AutomationStudioRequestWording } from "../request-rows/index.ts";
import { markedAdvice } from "./exclusion-words.ts";
import { refutedLabelled } from "./refuted-labelled.ts";
import { unconfirmedReading } from "./unconfirmed-reading.ts";
import { unstatedExclusion } from "./unstated-exclusion.ts";
import { answeredReadingOf } from "./yes-readings.ts";

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
export function unsettled(
  first: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification,
  basis: "model_disagreed" | "model_unconfirmed",
  code: string,
  reason: string,
  verdicts: AutomationStudioResultVerdict[],
  weigh: {
    wording?: AutomationStudioRequestWording | undefined;
    reasked?: 1 | 2 | undefined;
    record?: AutomationStudioResultNoRecord | undefined;
    /** The no's call and what Core's record says of its reading, where it refutes any of it (header, t628). */
    refuted?: ({ call: 1 | 2 } & AutomationStudioResultNoWeighed) | undefined;
  } = {}
): AutomationStudioResultVerification {
  const read = unconfirmedReading(first) ?? unconfirmedReading(second);
  // A split's no whose advice adds an exclusion the request never states, marked so (header, t515).
  const unstated = basis === "model_disagreed" ? unstatedExclusion(first, second, weigh.wording, weigh.record) : undefined;
  const marked = read && unstated ? { ...read, advice: markedAdvice(unstated, read.advice ?? "", weigh.reasked === unstated.call) } : read;
  const reading = marked && weigh.refuted ? refutedLabelled(marked, weigh.refuted) : marked;
  const answered = basis === "model_disagreed" ? answeredReadingOf(first) ?? answeredReadingOf(second) : undefined;
  return { schemaVersion: first.schemaVersion, verdict: "unsure", basis, code, reason, observation: first.observation, verdicts, calls: 2, ...(reading ? { unconfirmedReading: reading } : {}), ...(answered ? { answeredReading: answered } : {}) };
}
