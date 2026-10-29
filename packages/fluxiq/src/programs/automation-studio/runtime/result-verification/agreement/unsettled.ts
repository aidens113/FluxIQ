import type { AutomationStudioResultVerdict, AutomationStudioResultVerification } from "../contracts/index.ts";
import type { AutomationStudioResultNoRecord, AutomationStudioResultNoWeighed } from "../refuted-no/index.ts";
import type { AutomationStudioRequestWording } from "../request-rows/index.ts";
import { listedValuesAdvice, markedAdvice } from "./exclusion-words.ts";
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
 *
 * **An unsure plus a no is checked for an unstated exclusion too (t790, F2 of
 * run `run-mvswh11y-9d462629`).** Trial 1 there was unsure plus no
 * (`model_unconfirmed`), and the no's advice, to leave out accessory rows the
 * request never excludes, went out as `unconfirmedReading.advice` unmarked; the
 * builder followed it. The t515 screen now runs for both bases. Nothing was
 * asked again for such a no, so its mark never says it was (`reasked` holds only
 * for a split, whose no `reask-split-no.ts` or the exclusion re-ask asked again).
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
  // A no whose advice adds an exclusion the request never states, marked so, on a split and on an unsure beside it (header, t515, t790).
  const unstated = unstatedExclusion(first, second, weigh.wording, weigh.record);
  const exclusionMarked = read && unstated ? { ...read, advice: markedAdvice(unstated, read.advice ?? "", basis === "model_disagreed" && weigh.reasked === unstated.call) } : read;
  // Advice listing literal values the request never says gets a note, kept whole (t785, `./exclusion-words.ts`).
  const marked = exclusionMarked?.advice ? { ...exclusionMarked, advice: listedValuesAdvice(exclusionMarked.advice, weigh.wording) } : exclusionMarked;
  const reading = marked && weigh.refuted ? refutedLabelled(marked, weigh.refuted) : marked;
  const answered = basis === "model_disagreed" ? answeredReadingOf(first) ?? answeredReadingOf(second) : undefined;
  return { schemaVersion: first.schemaVersion, verdict: "unsure", basis, code, reason, observation: first.observation, verdicts, calls: 2, ...(reading ? { unconfirmedReading: reading } : {}), ...(answered ? { answeredReading: answered } : {}) };
}
