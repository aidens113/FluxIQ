// The package that lets Turbopack leave Core to Node (`write-core-bridge.mjs`);
// `next.config.ts` writes it and aliases Core to it. `core-entry-names.mjs`
// reads the names each Core entry point exports, which the bridge re-exports.

export { coreEntryNames } from "./core-entry-names.mjs";
export { CORE_BRIDGE_PACKAGE, writeCoreBridge } from "./write-core-bridge.mjs";
