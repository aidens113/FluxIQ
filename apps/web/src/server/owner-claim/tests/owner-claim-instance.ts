import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FluxIQ } from "fluxiq";
import { SQLiteRepository } from "fluxiq/database-manager";
import { createPlatformServices, MemoryEmailSender, MemoryIamAuditSink, type FluxIQDeploymentSettings, type PlatformServices } from "fluxiq/platform";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";

// Test support for the owner claim: a real FluxIQ instance in a temporary
// root (its identity-access and secret-key services at their real cost, so
// the default admin/admin account exists exactly as on a first start), with
// the platform services composed over its databases as
// `server/provisioning-listener/platform-services.ts` composes them, single
// tenancy included. Every password and code here is a dummy value.

export type OwnerClaimInstance = {
  root: string;
  fluxiq: FluxIQ;
  fluxiqDir: string;
  services: PlatformServices;
  /** The deployment settings for `env` over a self-hosted default with a public origin. */
  settings(env?: Record<string, string>): FluxIQDeploymentSettings;
  close(): Promise<void>;
};

export async function createOwnerClaimInstance(): Promise<OwnerClaimInstance> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-owner-claim-"));
  const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
  await fluxiq.setup();
  const layoutVersion = path.basename(fluxiq.paths.config) === "config.json" ? 2 : 1;
  const services = await createPlatformServices({
    repository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.store", layoutVersion }),
    iamRepository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.iam", layoutVersion }),
    identity: fluxiq.programs.identityAccess,
    email: new MemoryEmailSender(),
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://fluxiq.example.test",
    tenancy: { mode: "single", workspaceId: "workspace-main" }
  });
  return {
    root,
    fluxiq,
    fluxiqDir: fluxiq.paths.fluxiq,
    services,
    settings: (env = {}) => resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "self-hosted", FLUXIQ_PUBLIC_ORIGIN: "https://fluxiq.example.test", ...env }),
    async close() {
      await fluxiq.close();
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  };
}
