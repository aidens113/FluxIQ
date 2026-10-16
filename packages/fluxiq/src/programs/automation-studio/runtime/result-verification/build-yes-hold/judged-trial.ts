// The build's judged test of the Flow revision a run executed, as the run's
// result check is told it (`./held-double-no.ts`, t660).

import type { AutomationStudioFlowGraphVersion } from "../../flow-version/index.ts";
import type { AutomationStudioResultBuildYesHoldBecause } from "./because.ts";

/**
 * The trial a build judged the very Flow revision a run executed by, where
 * there is one: its own run (whose stored rows Core reads itself), its
 * verdict, how many judge calls reached it, and the digest of the request it
 * was judged against (`../../flow-version/instruction-digest.ts`). A yes stands
 * only once a second call confirmed it (t296), so `calls` is at least 2 on a
 * yes Core may hold to.
 */
export type AutomationStudioResultJudgedBuildTrial = {
  trialRunId: string;
  verdict: "yes" | "no" | "unsure" | "not_judged";
  calls: number;
  instructionDigest: string;
};

/**
 * Why a port names no trial for a run (t664, `./because.ts`): the saved Flow
 * names none, or the run did not execute the versions it judged.
 */
export type AutomationStudioResultJudgedBuildTrialMissing = { missing: Extract<AutomationStudioResultBuildYesHoldBecause, "no_build_trial" | "revision_mismatch"> };

/**
 * Finds that trial for a run: the project, the Flow (and the Subflow its
 * router chose) and the run, with the graph versions the run recorded
 * executing. Where the build judged no trial of exactly those versions, why
 * not; `undefined` reads as `no_build_trial`.
 */
export type AutomationStudioResultJudgedBuildTrialPort = (input: {
  projectId: string;
  flowId: string;
  subflowId?: string | undefined;
  runId: string;
  flowVersions: readonly AutomationStudioFlowGraphVersion[];
}) => Promise<AutomationStudioResultJudgedBuildTrial | AutomationStudioResultJudgedBuildTrialMissing | undefined>;
