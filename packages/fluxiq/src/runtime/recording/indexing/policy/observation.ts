import type { ObservationEntry } from "@fluxiq/contracts/recording";
import type { StateSnapshot } from "@fluxiq/contracts/state";

export type RecordingIndexObservationPolicy = {
  isSnapshot(entry: ObservationEntry): boolean;
  embeddedState(entry: ObservationEntry): StateSnapshot | undefined;
};
