import type { TrustedModuleBuildIdentity } from "./types.ts";
/** Anchors survive legacy replacements; only active provenance is attestable. */
export const trustedModuleBindings = new WeakMap<object, { anchor: TrustedModuleBuildIdentity; active: TrustedModuleBuildIdentity | null }>();
