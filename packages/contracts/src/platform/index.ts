// Barrel for the hosted platform contracts (hosted production plan): the
// deployment profiles, URL shapes, discovery, connect and the connected-client
// credential, the client gateway 0.2 vocabulary, the Origin grammar, the
// provisioning API, the panel's product manifest, session references, and the
// locked-key error. Domain-neutral: Core implements them under
// `packages/fluxiq/src/platform/`.
export * from "./connect/index.ts";
export * from "./discovery/index.ts";
export * from "./gateway/index.ts";
export * from "./model-keys/index.ts";
export * from "./origin/index.ts";
export * from "./panel/index.ts";
export * from "./profile.ts";
export * from "./provisioning/index.ts";
export * from "./session/index.ts";
export * from "./url/index.ts";
