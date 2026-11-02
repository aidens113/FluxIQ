import { candidateTrialOfflineLeases } from "./offline-registry.ts";

export function candidateTrialOfflineLease(environment: object | undefined): object | undefined {
  const record = environment && candidateTrialOfflineLeases.get(environment);
  return record && record.active ? record.lease : undefined;
}
