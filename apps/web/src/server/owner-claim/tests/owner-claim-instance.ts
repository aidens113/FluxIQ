import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FluxIQ, type FluxIQOptions } from "fluxiq";
import { SQLiteRepository } from "fluxiq/database-manager";
import { createPlatformServices, MemoryEmailSender, MemoryIamAuditSink, type FluxIQDeploymentSettings, type PlatformServices } from "fluxiq/platform";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";

// Test support for the owner claim: a real FluxIQ instance in a temporary
// root (its identity-access and secret-key services at their real cost), with
// the platform services composed over its databases as
// `server/provisioning-listener/platform-services.ts` composes them: service is
// multi-tenant; self-hosted is single. Every password and code is synthetic.
//
// `start` picks which root: "fresh" is a new install, whose identity store
// starts empty as `lib/fluxiq.ts` composes every instance; "old-root" (the
// default) is an install made before that, whose store still seeds the default
// admin/admin account on first load, for the claim to retire.

export type OwnerClaimInstance = {
  root: string;
  fluxiq: FluxIQ;
  fluxiqDir: string;
  services: PlatformServices;
  /** The deployment settings for `env` over a self-hosted default with a public origin. */
  settings(env?: Record<string, string>): FluxIQDeploymentSettings;
  close(): Promise<void>;
};

export async function createOwnerClaimInstance(options: { profile?: "service" | "self-hosted"; start?: "fresh" | "old-root" } = {}): Promise<OwnerClaimInstance> {
  const profile = options.profile ?? "self-hosted";
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-owner-claim-"));
  const fluxiqOptions: FluxIQOptions = { rootDir: root, loadEnv: false, modelProvidersEnabled: false };
  if (profile === "service") fluxiqOptions.iam = { profile: "service" };
  const fluxiq = FluxIQ.create(fluxiqOptions);
  if ((options.start ?? "old-root") === "fresh" && !fluxiq.programs.identityAccess.firstRun.startUnclaimed()) throw new Error("The identity store loaded before it could start unclaimed.");
  await fluxiq.setup();
  const layoutVersion = path.basename(fluxiq.paths.config) === "config.json" ? 2 : 1;
  const services = await createPlatformServices({
    repository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.store", layoutVersion }),
    iamRepository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.iam", layoutVersion }),
    identity: fluxiq.programs.identityAccess,
    email: new MemoryEmailSender(),
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://fluxiq.example.test",
    tenancy: profile === "service" ? { mode: "multi" } : { mode: "single", workspaceId: "workspace-main" }
  });
  return {
    root,
    fluxiq,
    fluxiqDir: fluxiq.paths.fluxiq,
    services,
    settings: (env = {}) => resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: profile, FLUXIQ_PUBLIC_ORIGIN: "https://fluxiq.example.test", ...env }),
    async close() {
      await fluxiq.close();
      if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith("fluxiq-owner-claim-")) throw new Error("Invalid synthetic owner-claim cleanup target.");
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  };
}
