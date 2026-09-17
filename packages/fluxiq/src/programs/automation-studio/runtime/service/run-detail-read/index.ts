// Barrel for reading a run's detail strictly: the typed runtime store is asked
// only through an accessor that tells "no store configured" apart from a store
// that failed.
export * from "./configured-runtime-stream-store.ts";
export * from "./flow-run-detail-reader.ts";
