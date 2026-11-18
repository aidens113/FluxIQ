import type { AppInstallationV1, AppManifestV1 } from "@fluxiq/contracts/apps";
import type { AppMutationGuard } from "./mutation-guard.ts";
import type { AppInstallationRevision } from "./installation-revision.ts";

/** Internal persistence port. Host authorization is mandatory; this is not an HTTP API. */
export interface AppRegistryStore {
  registerManifest(manifest: AppManifestV1, guard: AppMutationGuard): Promise<"registered" | "existing">;
  getManifest(identity: Pick<AppManifestV1, "publisherId" | "appId" | "version">): Promise<AppManifestV1 | null>;
  createInstallation(record: AppInstallationV1, actorUserId: string, guard: AppMutationGuard): Promise<boolean>;
  replaceInstallation(record: AppInstallationV1, expectedRevision: number, actorUserId: string, guard: AppMutationGuard): Promise<boolean>;
  getInstallation(installationId: string): Promise<AppInstallationV1 | null>;
  listInstallations(workspaceId: string): Promise<AppInstallationV1[]>;
  history(installationId: string): Promise<AppInstallationRevision[]>;
  close(): Promise<void>;
}
