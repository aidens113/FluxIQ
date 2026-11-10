import type { FluxNodeCaller } from "../../framework/automation-service/service/fluxnode/index.ts";

/** Who every call acts as in open mode: the local owner under `FluxNodeRunner` rights, never an administrator (plan, K4 and K8). */
export const FLUXNODE_OPEN_MODE_CALLER: FluxNodeCaller = Object.freeze({ principal: "owner", policy: "FluxNodeRunner", via: "open_mode" });
