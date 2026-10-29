import { mkdirSync } from "node:fs";
import path from "node:path";
import { SQLiteRepository } from "fluxiq/database-manager";
import { BufferedIamAuditSink, createPlatformServices, FileEmailSender, IamAuditStore, NoneEmailSender, type PlatformServices } from "fluxiq/platform";
import { getFluxIQ } from "../../lib/fluxiq";

// The platform services (account provisioning, the welcome and reset links)
// for the running web server: one composition per FluxIQ instance, built on
// first use and shared by the private provisioning listener and the account
// pages. The data lives beside the instance's other databases ("platform.store"
// and "platform.iam"); the IAM decision audit is the persistent compact store
// under `<fluxiq>/platform/iam-audit.sqlite`.

const SINGLE_WORKSPACE_ID = process.env.FLUXIQ_WORKSPACE_ID?.trim() || "workspace-main";
const DEFAULT_PUBLIC_ORIGIN = "http://127.0.0.1:3000";

const services = new WeakMap<object, Promise<PlatformServices>>();

export function getPlatformServices(): Promise<PlatformServices> {
  const fluxiq = getFluxIQ();
  const existing = services.get(fluxiq);
  if (existing !== undefined) return existing;
  const created = composePlatformServices(fluxiq);
  // A failed composition is not cached, so the next call tries again.
  created.catch(() => services.delete(fluxiq));
  services.set(fluxiq, created);
  return created;
}

async function composePlatformServices(fluxiq: ReturnType<typeof getFluxIQ>): Promise<PlatformServices> {
  const layoutVersion = path.basename(fluxiq.paths.config) === "config.json" ? 2 : 1;
  const platformDir = path.join(fluxiq.paths.fluxiq, "platform");
  mkdirSync(platformDir, { recursive: true });
  const auditStore = await IamAuditStore.open(path.join(platformDir, "iam-audit.sqlite"));
  const auditSink = new BufferedIamAuditSink(auditStore, { onError: () => console.warn("The IAM audit could not be written.") });
  return createPlatformServices({
    repository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.store", layoutVersion }),
    iamRepository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.iam", layoutVersion }),
    identity: fluxiq.programs.identityAccess,
    email: process.env.FLUXIQ_EMAIL_SENDER?.trim() === "none" ? new NoneEmailSender() : new FileEmailSender({ directory: path.join(platformDir, "outbox") }),
    auditSink,
    publicOrigin: process.env.FLUXIQ_PUBLIC_ORIGIN?.trim() || DEFAULT_PUBLIC_ORIGIN,
    tenancy: { mode: "single", workspaceId: SINGLE_WORKSPACE_ID }
  });
}
