// The package through which the panel's Node server loads Core once
// (`write-core-bridge.mjs`); `next.config.ts` writes it and aliases Core to it.

export { CORE_BRIDGE_PACKAGE, writeCoreBridge } from "./write-core-bridge.mjs";
