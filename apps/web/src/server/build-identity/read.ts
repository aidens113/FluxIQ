import type { TrustedModuleBuildIdentity } from "fluxiq/runtime";
const embedded = "__FLUXIQ_SERVER_IDENTITY_BEGIN__eyJmbHV4aXFTZXJ2ZXJJZGVudGl0eVBsYWNlaG9sZGVyIjozMTB9__FLUXIQ_SERVER_IDENTITY_END__";
/** Identity is captured from the executing native server artifact, never disk. */
export function readServerBuildIdentity(): TrustedModuleBuildIdentity | null {
  const match = /^__FLUXIQ_SERVER_IDENTITY_BEGIN__([A-Za-z0-9+/=]+)__FLUXIQ_SERVER_IDENTITY_END__$/.exec(embedded);
  if (!match) throw new Error("Malformed executing server identity slot.");
  const bytes = Buffer.from(match[1]!, "base64");
  if (bytes.toString("base64") !== match[1]) throw new Error("Malformed executing server identity encoding.");
  const identity = JSON.parse(bytes.toString("utf8"));
  if (identity.fluxiqServerIdentityPlaceholder === 310 && Object.keys(identity).length === 1) return null;
  if (identity.schema !== 1 || identity.protocol !== "fluxiq.module-build-identity.v1" || identity.moduleId !== "fluxiq/web-client-gateway-server"
    || identity.normalization !== "module-payload-v1" || typeof identity.version !== "string" || Object.keys(identity).length !== 7
    || !/^[a-f0-9]{64}$/.test(identity.artifactDigest) || !/^[a-f0-9]{64}$/.test(identity.sourceInputsDigest)) throw new Error("Malformed executing server build identity.");
  return Object.freeze(identity);
}
