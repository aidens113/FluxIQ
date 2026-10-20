// A trial as one traced episode (D9): activity `test`, its episode id the
// trial's own run id. Opened by the trial ports (`../service/candidate-trial/
// port.ts`, `../service/subflow-trial/port.ts`) around the trial they run, not
// inside the trial runner: the port mints the run id the runner would have
// minted -- the ports' `newRunId`, else the environment's -- opens the episode
// under it, and hands the runner a copy of its ports whose `newRunId` answers
// that id. Inside a build the trial replaces the build's frame for its own
// work, and the build's trace keeps markers naming the trial's trace. The
// start hook and the site reset run before the port is called, so they stay
// in the build's trace.
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
