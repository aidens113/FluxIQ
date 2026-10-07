import type { TrustedModuleBuildIdentity } from "./types.ts";
/** Copy a closed, bounded descriptor before the runtime can mutate its input. */
export function screenTrustedModuleIdentity(value: TrustedModuleBuildIdentity): TrustedModuleBuildIdentity {
  const keys = ["artifactDigest", "moduleId", "normalization", "protocol", "schema", "sourceInputsDigest", "version"];
  if (!value || Object.keys(value).sort().join() !== keys.join() || value.schema !== 1 || value.protocol !== "fluxiq.module-build-identity.v1"
    || value.normalization !== "module-payload-v1" || typeof value.moduleId !== "string" || !/^[a-zA-Z0-9@][a-zA-Z0-9@/_-]{0,159}$/.test(value.moduleId) || value.moduleId.includes("..")
    || typeof value.version !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,79}$/.test(value.version)
    || !/^[a-f0-9]{64}$/.test(value.artifactDigest) || !/^[a-f0-9]{64}$/.test(value.sourceInputsDigest)) throw new Error("Malformed trusted module build identity.");
  return Object.freeze({ schema: 1, protocol: value.protocol, moduleId: value.moduleId, version: value.version, normalization: value.normalization, artifactDigest: value.artifactDigest, sourceInputsDigest: value.sourceInputsDigest });
}
