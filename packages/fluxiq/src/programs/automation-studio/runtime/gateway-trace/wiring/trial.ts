// A trial as one traced episode (D9): activity `test`, its episode id the
// trial's own run id. Opened by the trial runners (`../../service/
// candidate-trial/run.ts`, `../../service/subflow-trial/run.ts`) after the
// trial's start and around its own run (P3, D1): the runner hands in the run
// id minting it would have used -- the ports' `newRunId`, else the
// environment's -- this mints the id once, opens the episode under it, and
// hands the runner a minter answering that id. Inside a build the trial
// replaces the build's frame for its own work, and the build's trace keeps
// markers naming the trial's trace. The start hook, prepared by the gate or
// called by the runner, and the site reset run before the episode opens, so
// they stay in the build's trace.
//
// Nothing installed: the work runs with the ports unchanged, and no id is
// minted ahead of the runner.

import { automationStudioLiveRunEnvironment } from "../../environment/index.ts";
import { AutomationStudioGatewayTraceInstallation } from "../installation.ts";
import type { AutomationStudioGatewayTraceEpisode } from "../types.ts";
import type { AutomationStudioGatewayTraceTrial } from "./types.ts";

/**
 * Runs `work` as the trial's traced episode. `work` is handed the run id
 * minter its runner must use -- one answering the episode's id -- or nothing
 * when tracing is not installed, in which case it runs exactly as before.
 */
export async function withAutomationStudioGatewayTraceTrial<T>(trial: AutomationStudioGatewayTraceTrial, work: (newRunId: (() => string) | undefined) => Promise<T>): Promise<T> {
  const episodes = AutomationStudioGatewayTraceInstallation.current();
  if (episodes === undefined) return await work(undefined);
  const runId = trial.newRunId?.() ?? (trial.environment ?? automationStudioLiveRunEnvironment).newRunId(trial.prefix);
  const episode: AutomationStudioGatewayTraceEpisode = { projectId: trial.projectId, episodeId: runId, activity: "test", flowId: trial.flowId, context: trial.context(runId) };
  return await episodes.run(episode, () => work(() => runId));
}
