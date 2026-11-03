// Whether a runtime patch's recorded verification says its evidence is the
// judged whole run rather than its own trial (t267).
//
// The live patch writes the marker from the typed verdict
// (`../../live-patch.ts`, `awaitsJudgedRun`): a target override whose trial
// changed node succeeded with nothing failed or unknown, and with no evidence
// declared to prove it. Everything after that reads it back as JSON -- off the
// adaptation's `metadata.verification` (the promotion gate, the judged settle)
// or off the run's receipt (the adaptive retry) -- so the reading lives here,
// once, where all three can import it.
import { isJsonRecord } from "../json-values.ts";

/** True only for `{ status: "unverifiable", awaitsJudgedRun: true }`; anything else, or nothing, is false. */
export function automationStudioVerificationAwaitsJudgedRun(verification: unknown): boolean {
  return isJsonRecord(verification) && verification.status === "unverifiable" && verification.awaitsJudgedRun === true;
}
