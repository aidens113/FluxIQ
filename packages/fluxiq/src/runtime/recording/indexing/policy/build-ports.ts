import type { RecordingReferenceReader } from "./reference-reader.ts";
import type { RecordingIndexObservationPolicy } from "./observation.ts";

export type RecordingIndexBuildPorts = {
  references: RecordingReferenceReader;
  observations: RecordingIndexObservationPolicy;
  now(): number;
};
