// One offline trial of a submitted candidate (traces and offline trials, P4):
// the candidate trial runner, unchanged, with its environment a recorded trace.
//
// 1. The session. The phase, the source trace and the trace environment whose
//    only client is a matcher session over that trace are the offline trial's
//    matcher session (`./matcher-session.ts`), shared with the subflow runner
//    (`./subflow-run.ts`): exploration is refused, so is a derived source, a
//    trace the matcher refuses and one with no session view from the trace or
//    the caller, all before anything runs or any judge is paid.
// 2. The run. `runAutomationStudioCandidateTrial` with `ports.environment` set
//    to that environment and its clock: the same code path as a live trial.
//    Every command the executor, the host runtime and the evidence tools send
//    reaches the matcher through the gateway, and every answer comes back
//    through the gateway's real intake. The runner itself runs no start hook
//    and no site reset for a non-live environment (Decision 6); the judge is
//    asked about the new run's evidence (no model answer is ever replayed,
//    T22); and the trial's episode records a derived trace naming this source
//    (T24, `AutomationStudioGatewayTraceReplaySources`).
// 3. The end. The answer is the runner's outcome beside the trial evidence
//    result (`./evidence-result.ts`), validated against U5 and bound to the
//    candidate's original instructions digest unless the caller names a goal
//    contract, with what the session reports.
//
// A cancelled build is not a verdict: the abort the runner throws goes on.

import { runAutomationStudioCandidateTrial } from "../candidate-trial/index.ts";
import type { AutomationStudioOfflineCandidateTrialInput, AutomationStudioOfflineCandidateTrialOutcome } from "./contracts.ts";
import { automationStudioOfflineTrialEvidenceResult } from "./evidence-result.ts";
import { automationStudioOfflineTrialMatcherSession } from "./matcher-session.ts";

/** The goal contract a candidate with no original instructions digest is bound to, as the trial runner binds it (`../candidate-trial/run.ts`). */
const UNBOUND_GOAL = "candidate.requirements.unbound";

export async function runAutomationStudioOfflineCandidateTrial(input: AutomationStudioOfflineCandidateTrialInput): Promise<AutomationStudioOfflineCandidateTrialOutcome> {
  const { request, ports } = input;
  request.signal.throwIfAborted();
  const session = await automationStudioOfflineTrialMatcherSession(input, (environment) => runAutomationStudioCandidateTrial(request, { ...ports, environment, now: environment.now }));
  if (session.status === "refused") return session;
  const { trial, matcher, sessionView, normalizations, supported, reevaluated, sourceEpisodeId } = session;
  const evidence = automationStudioOfflineTrialEvidenceResult({
    trial,
    matcher,
    sourceEpisodeId,
    goalContractVersion: input.goalContractVersion ?? request.candidate.originalInstructionsDigest ?? UNBOUND_GOAL
  });
  return { status: "ran", trial, evidence, matcher, sessionView, normalizations, supported, reevaluated };
}
