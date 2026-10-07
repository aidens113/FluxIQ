/** Optional provenance supplied only by trusted, locally loaded runtime modules. */
export type TrustedModuleBuildIdentity = Readonly<{ schema: 1; protocol: "fluxiq.module-build-identity.v1"; moduleId: string; version: string; normalization: "module-payload-v1"; artifactDigest: string; sourceInputsDigest: string }>;
