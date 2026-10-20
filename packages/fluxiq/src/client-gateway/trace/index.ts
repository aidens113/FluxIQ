// Client gateway traces: what Core received from clients during one live
// episode, captured inside the gateway (trace-offline-trials-plan, P1). The
// manifest, the event envelope, completeness, the sink port the gateway
// records through, and the store port traces are read from. Exported from
// `client-gateway/index.ts` only, never from the browser-bundle entry
// `client-gateway/contracts.ts`: the digest reaches Node.
export type * from "./capture-source.ts";
export * from "./versions.ts";
export * from "./vocabulary.ts";
export * from "./completeness-vocabulary.ts";
export type * from "./types.ts";
export * from "./clone-json.ts";
export * from "./artifact-digest.ts";
export * from "./evaluate-completeness.ts";
export * from "./derived-origin.ts";
export * from "./recorder.ts";
export * from "./memory-store.ts";
