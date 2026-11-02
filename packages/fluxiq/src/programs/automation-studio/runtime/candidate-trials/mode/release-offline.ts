import { candidateTrialOfflineLeases } from "./offline-registry.ts";

export function releaseCandidateTrialOfflineEnvironment(environment: object, lease: object): void {
  const record = candidateTrialOfflineLeases.get(environment);
  if (!record || record.lease !== lease) throw new Error("candidate.trial_offline_lease_foreign");
  record.active = false;
}
