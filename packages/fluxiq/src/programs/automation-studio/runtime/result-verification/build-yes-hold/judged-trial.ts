// The build's judged test of the Flow revision a run executed, as the run's
// result check is told it (`./held-double-no.ts`, t660).

import type { AutomationStudioFlowGraphVersion } from "../../flow-version/index.ts";

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
 * Finds that trial for a run: the project, the Flow (and Subflow) and the run,
 * with the graph versions the run recorded executing. Nothing where the build
 * judged no trial of exactly those versions, or the deployment keeps none.
 */
export type AutomationStudioResultJudgedBuildTrialPort = (input: {
  projectId: string;
  flowId: string;
  subflowId?: string | undefined;
  runId: string;
  flowVersions: readonly AutomationStudioFlowGraphVersion[];
}) => Promise<AutomationStudioResultJudgedBuildTrial | undefined>;
