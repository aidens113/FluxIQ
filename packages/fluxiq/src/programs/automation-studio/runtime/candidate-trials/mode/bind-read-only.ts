import type { AutomationStudioCandidateTrialPort } from "../../flow-bootstrap/candidate/index.ts";
import { candidateTrialReadOnlyPorts } from "./read-only-ports.ts";

/** Called by an actual producer for its distinct no-dispatch callback, never for a live-or-cache branch. */
export function bindCandidateTrialReadOnly(port: object, callback: AutomationStudioCandidateTrialPort, offline?: { environment: object; lease: object }): void {
  if (port === callback) throw new Error("candidate.trial_readonly_callback_required");
  const prior = candidateTrialReadOnlyPorts.get(port) ?? {};
  if (offline) {
    if (prior.offline) throw new Error("candidate.trial_readonly_rebound");
    prior.offline = Object.freeze({ callback, environment: offline.environment, lease: offline.lease });
  } else {
    if (prior.cached) throw new Error("candidate.trial_readonly_rebound");
    prior.cached = callback;
  }
  candidateTrialReadOnlyPorts.set(port, prior);
}
