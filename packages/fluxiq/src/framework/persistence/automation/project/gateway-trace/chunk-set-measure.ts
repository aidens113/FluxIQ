// The chunks several persisted gateway traces use, each counted once
// (trace-offline-trials-plan, lane T P3). A chunk is stored once per project,
// so over a set of traces the stored chunk bytes are those of the distinct
// chunks, not the sum of each trace's own figure.

/** Distinct chunks over a set of traces. Counts and byte lengths only. */
export type AutomationStudioGatewayTraceChunkSetMeasure = {
  readonly traces: number;
  readonly chunks: number;
  readonly storedChunkBytes: number;
};
