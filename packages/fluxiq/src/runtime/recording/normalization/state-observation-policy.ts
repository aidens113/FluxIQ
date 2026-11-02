import type { ObservationEntry } from "@fluxiq/contracts/recording";
export type StateObservationPolicy = { isStateObservation(entry: ObservationEntry): boolean };
