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
// Core reads itself), its verdict and how many judge calls reached it, the
// digest of the request it was judged against
// (`../instruction-digest.ts`), the adaptation applied, and the graph versions
// apply saved. Ids, a count and a digest: no page data, no row, no request
// text.
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
  /** The judge calls behind the yes: two where a second call confirmed it (t296). */
  calls: number;
  /** `automationStudioFlowInstructionDigest` of the Flow's instructions, as the run's result check digests them. */
  instructionDigest: string;
  adaptationId: string;
  /** The orchestration Flow and each Subflow graph apply saved, at the revision it saved them. */
  versions: AutomationStudioFlowGraphVersion[];
};
