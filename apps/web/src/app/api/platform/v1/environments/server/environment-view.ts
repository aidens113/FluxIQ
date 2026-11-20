import type { EnvironmentRecord } from "fluxiq/platform";

/** What a person sees of an environment: its id, what was asked of it and what is observed. Never its account or driver internals. */
export function environmentView(record: EnvironmentRecord): { environmentId: string; desired: EnvironmentRecord["desired"]; observed: EnvironmentRecord["observed"] } {
  return { environmentId: record.environmentId, desired: record.desired, observed: record.observed };
}
