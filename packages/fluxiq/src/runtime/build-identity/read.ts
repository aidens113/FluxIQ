import type { CoreRuntimeBuildIdentity } from "./types.ts";

// The build generator replaces only this literal. Surrounding reader code is hashed.
/* core-runtime-identity:start */
const embedded = '{"fluxiqRuntimeIdentityPlaceholder":302}';
/* core-runtime-identity:end */

/** Captured from executing code, never reread from disk or a reloaded route. */
export function readCoreRuntimeBuildIdentity(): CoreRuntimeBuildIdentity | null {
  const identity = JSON.parse(embedded) as CoreRuntimeBuildIdentity;
  if (identity.schema !== 1 || identity.protocol !== "fluxiq.core-runtime-identity.v1" || identity.normalization !== "reader-payload-v1"
    || !/^[a-f0-9]{64}$/.test(identity.artifactDigest) || !identity.artifacts || typeof identity.version !== "string") return null;
  return Object.freeze({ ...identity, artifacts: Object.freeze({ ...identity.artifacts }) });
}
