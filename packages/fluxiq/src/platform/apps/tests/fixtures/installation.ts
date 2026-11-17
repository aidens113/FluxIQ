import type { AppInstallationV1, AppManifestV1 } from "@fluxiq/contracts/apps";

export function appInstallationFixture(manifest: AppManifestV1, overrides: Partial<AppInstallationV1> = {}): AppInstallationV1 {
  const { publisherId, appId, version, packageDigest, manifestDigest } = manifest;
  return {
    schemaVersion: 1, installationId: "installation.one", workspaceId: "workspace.one",
    app: { publisherId, appId, version, packageDigest, manifestDigest }, approvedGrants: structuredClone(manifest.requestedGrants),
    target: { kind: "customer-owned", environment: "local", targetId: "local.one" }, payer: { kind: "no-managed-compute-charge" },
    installedByUserId: "user.one", installedAtMs: 1_000, updatedAtMs: 1_000, generation: 1, revision: 1, status: "active", ...overrides
  };
}
