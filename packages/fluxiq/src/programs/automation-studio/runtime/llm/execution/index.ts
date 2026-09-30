// A grant: what authorizes one run's LLM spend and what it says about itself.
//
// These shared the `execution-` prefix as flat files, which the structure
// audit reads as a directory that has not been made yet -- and it was right.
// They are one subject: the store that mints, holds and claims a grant, the
// checks it leans on, and the metadata a caller may read off one. The typed
// refusal a grant raises lives in `../grant-refusal/`, a leaf with no imports,
// because the provider contract reads it and this directory imports the
// provider contract -- a cycle through this barrel left the harness's exports
// half-copied under vite-node.
export * from "./grant-checks.ts";
export * from "./grant-metadata.ts";
export * from "./grants.ts";
