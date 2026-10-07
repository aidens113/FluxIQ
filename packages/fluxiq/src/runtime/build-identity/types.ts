/** Build-time artifact hashes; the reader payload slot alone is normalized. */
export type CoreRuntimeBuildIdentity = Readonly<{
  schema: 1;
  protocol: "fluxiq.core-runtime-identity.v1";
  version: string;
  normalization: "reader-payload-v1";
  artifactDigest: string;
  artifacts: Readonly<Record<string, string>>;
}>;
