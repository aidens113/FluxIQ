// Reliability accounting by live episode (source plan section 8). Only
// original whole live runs count, once per live episode id; every offline,
// segment, derived or invalid result is ignored, so replaying one live episode
// any number of times leaves the tally unchanged (source test T19).

import { isAutomationStudioTrialEvidenceLiveSuccess } from "./live-success-eligibility.ts";
import { validateAutomationStudioTrialEvidenceResult } from "./validate-trial-evidence-result.ts";

/** Distinct live episodes among `inputs`, and how many of them have a live success. */
export function tallyAutomationStudioLiveEpisodes(inputs: Iterable<unknown>): { liveEpisodes: number; liveSuccesses: number } {
  const episodes = new Set<string>();
  const successes = new Set<string>();
  for (const input of inputs) {
    const answer = validateAutomationStudioTrialEvidenceResult(input);
    if (!answer.ok) continue;
    const result = answer.result;
    if (result.scope !== "full_live_run" || result.provenance !== "original" || result.liveEpisodeId === null) continue;
    episodes.add(result.liveEpisodeId);
    if (isAutomationStudioTrialEvidenceLiveSuccess(result)) successes.add(result.liveEpisodeId);
  }
  return { liveEpisodes: episodes.size, liveSuccesses: successes.size };
}
