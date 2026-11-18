import type { AppInstallationV1, AppManifestV1, AppOperationResolutionV1 } from "@fluxiq/contracts/apps";

/** Configuration and fresh resolution only; there is intentionally no accepted-run/execution method. */
export interface AppRegistryService {
  registerManifest(context: unknown, manifest: unknown): Promise<AppManifestV1>;
  install(context: unknown, proposal: unknown): Promise<AppInstallationV1>;
  update(context: unknown, input: { installationId: string; expectedRevision: number; proposal: unknown }): Promise<AppInstallationV1>;
  revoke(context: unknown, installationId: string): Promise<AppInstallationV1>;
  resolveOperation(context: unknown, invocation: unknown, expected?: AppOperationResolutionV1): Promise<AppOperationResolutionV1>;
}
