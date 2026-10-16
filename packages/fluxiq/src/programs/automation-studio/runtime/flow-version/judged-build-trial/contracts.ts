// The build's judged trial a saved Flow carries (t662).
//
// **Why.** A playback's double no beside its build's two yeses on the same rows
// is held unverified (`../../result-verification/build-yes-hold/`, t660), but
// that hold needs the trial the build judged the very revision a run executed,
// and nothing linked a saved Flow to the trial that passed it: the build's
// proposal named its trial only on an audit event, and a run names only the
// graph versions it ran. This is that link, written once, when a build's
// judged-yes candidate is applied as the Flow (`./applied.ts`), on the parent
// Flow's metadata, beside the adaptation that built it.
//
// **What it holds, and nothing more:** the trial's run id (whose stored rows
// Core reads itself), its verdict, how many judge calls reached it and whether
// its first two reached it (t677), the digest of the request it was judged
// against (`../instruction-digest.ts`), the adaptation applied, and the graph
// versions apply saved. Ids, a count, a flag and a digest: no page data, no
// row, no request text.
//
// **Which run it speaks for.** Only a run that executed exactly versions apply
// saved (`./ran-judged-versions.ts`). A repair, a patch or a later build moves
// a graph's revision and the record no longer speaks for that run; a later
// apply replaces it, or removes it where its build judged no trial.

import type { AutomationStudioFlowGraphVersion } from "../contracts.ts";

/** The metadata key the parent Flow carries the record under. */
export const AUTOMATION_STUDIO_FLOW_JUDGED_BUILD_TRIAL_METADATA_KEY = "judgedBuildTrial";

/** The build's judged-yes trial of the Flow revision apply saved (header). */
export type AutomationStudioFlowJudgedBuildTrial = {
  trialRunId: string;
  verdict: "yes";
  /**
   * The judge calls behind the yes, as the build-test judge counted them (one
   * per ask): exactly two where a second call confirmed a first-ask yes
   * (t296); more where the yes was reached by asking calls again -- a refuted
   * no (t607), a contradicted unsure (t503) or a split's no (t515) re-asked --
   * or a call was asked again, after a temporary fault or the exclusion-evidence
   * recheck as well. The playback hold reads it as the re-ask mark only on a
   * record without `firstAskConfirmed` (t664,
   * `../../result-verification/build-yes-hold/held-double-no.ts`).
   */
  calls: number;
  /**
   * Whether the yes was reached by the judge's first two calls with nothing
   * re-asked of a different verdict, as the verification itself recorded it
   * (`../../result-verification/first-ask/`, t677) and the trial's record and
   * the proposal's `created` event carried it. What the playback hold reads in
   * place of `calls`. Absent on records apply wrote before t677, and where the
   * proposal did not say; the hold then counts `calls` as before.
   */
  firstAskConfirmed?: boolean;
  /** `automationStudioFlowInstructionDigest` of the Flow's instructions, as the run's result check digests them. */
  instructionDigest: string;
  adaptationId: string;
  /** The orchestration Flow and each Subflow graph apply saved, at the revision it saved them. */
  versions: AutomationStudioFlowGraphVersion[];
};
