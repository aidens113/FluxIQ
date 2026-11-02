import type { TrialOfflineRunner } from "./offline-runner.ts";
import { trialOfflineRunners } from "./offline-registry.ts";

export function bindTrialOfflineRunner(target: object, runner: TrialOfflineRunner): void {
  if (trialOfflineRunners.has(target)) throw new Error("candidate.trial_offline_runner_rebound");
  trialOfflineRunners.set(target, { runner });
}
