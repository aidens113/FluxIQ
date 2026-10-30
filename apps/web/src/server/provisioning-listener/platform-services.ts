import { mkdirSync } from "node:fs";
import path from "node:path";
import { SQLiteRepository } from "fluxiq/database-manager";
import { BufferedIamAuditSink, createPlatformServices, IamAuditStore, type PlatformServices } from "fluxiq/platform";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { getFluxIQ } from "../../lib/fluxiq";
import { primaryWorkspaceId } from "../../lib/workspaces";
import { resolveEmailSender } from "./resolve-email-sender";

// The platform services (account provisioning, the welcome and reset links)
// for the running web server: one composition per FluxIQ instance, built on
// first use and shared by the private provisioning listener and the account
// pages. The data lives beside the instance's other databases ("platform.store"
// and "platform.iam"); the IAM decision audit is the persistent compact store
// under `<fluxiq>/platform/iam-audit.sqlite`, written through one buffered sink
// that every workspace's registry records into under the service profile.

type PlatformComposition = { services: PlatformServices; auditSink: BufferedIamAuditSink };

const compositions = new WeakMap<object, Promise<PlatformComposition>>();

export function getPlatformServices(): Promise<PlatformServices> {
  return platformComposition().then((composition) => composition.services);
}

/** The buffered IAM decision audit the platform services write to; the workspace manager's registries record into it too. */
export function getPlatformIamAuditSink(): Promise<BufferedIamAuditSink> {
  return platformComposition().then((composition) => composition.auditSink);
}

function platformComposition(): Promise<PlatformComposition> {
  const fluxiq = getFluxIQ();
  const existing = compositions.get(fluxiq);
  if (existing !== undefined) return existing;
  const created = composePlatformServices(fluxiq);
  // A failed composition is not cached, so the next call tries again.
  created.catch(() => compositions.delete(fluxiq));
  compositions.set(fluxiq, created);
  return created;
}

async function composePlatformServices(fluxiq: ReturnType<typeof getFluxIQ>): Promise<PlatformComposition> {
  const layoutVersion = path.basename(fluxiq.paths.config) === "config.json" ? 2 : 1;
  const platformDir = path.join(fluxiq.paths.fluxiq, "platform");
  mkdirSync(platformDir, { recursive: true });
  const auditStore = await IamAuditStore.open(path.join(platformDir, "iam-audit.sqlite"));
  const auditSink = new BufferedIamAuditSink(auditStore, { onError: () => console.warn("The IAM audit could not be written.") });
  const services = await createPlatformServices({
    repository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.store", layoutVersion }),
    iamRepository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.iam", layoutVersion }),
    identity: fluxiq.programs.identityAccess,
    email: resolveEmailSender(process.env.FLUXIQ_EMAIL_SENDER, path.join(platformDir, "outbox")),
    auditSink,
    publicOrigin: resolveFluxIQDeploymentSettings(process.env).publicOrigin,
    tenancy: { mode: "single", workspaceId: primaryWorkspaceId() }
  });
  return { services, auditSink };
}
