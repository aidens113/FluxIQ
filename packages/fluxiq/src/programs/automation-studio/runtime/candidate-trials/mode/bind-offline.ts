import { candidateTrialOfflineLeases } from "./offline-registry.ts";

/** Only the actual matcher-session producer calls this after attaching the original offline session. */
export function bindCandidateTrialOfflineEnvironment(environment: object, matcher: object, session: object): object {
  if (candidateTrialOfflineLeases.get(environment)?.active) throw new Error("candidate.trial_offline_lease_already_bound");
  const lease = Object.freeze({});
  candidateTrialOfflineLeases.set(environment, { environment, matcher, session, lease, active: true });
  return lease;
}
