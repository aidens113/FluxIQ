import { mkdirSync } from "node:fs";
import path from "node:path";
import { SQLiteRepository } from "fluxiq/database-manager";
import { BufferedIamAuditSink, createPlatformServices, IamAuditStore, type PlatformServices } from "fluxiq/platform";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { getFluxIQAfterReload } from "../../lib/fluxiq";
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
type PlatformAudit = { store: IamAuditStore; sink: BufferedIamAuditSink };

// The audit belongs to the host root, not to a primary instance that a reload
// replaces. Tenant registries can keep using the same sink across that reload.
// Next's instrumentation and route bundles must share these owners just as
// they share __fluxiqWebRuntime; a module-local map would open the file twice.
const platformState = globalThis as typeof globalThis & {
  __fluxiqPlatformCompositions?: WeakMap<object, Promise<PlatformComposition>>;
  __fluxiqPlatformAudits?: Map<string, Promise<PlatformAudit>>;
};
const compositions = platformState.__fluxiqPlatformCompositions ??= new WeakMap<object, Promise<PlatformComposition>>();
const audits = platformState.__fluxiqPlatformAudits ??= new Map<string, Promise<PlatformAudit>>();

export function getPlatformServices(): Promise<PlatformServices> {
  return platformComposition().then((composition) => composition.services);
}

/** The buffered IAM decision audit the platform services write to; the workspace manager's registries record into it too. */
export async function getPlatformIamAuditSink(): Promise<BufferedIamAuditSink> {
  const fluxiq = await getFluxIQAfterReload({ allowDuringShutdown: true });
  const platformDir = path.join(fluxiq.paths.fluxiq, "platform");
  mkdirSync(platformDir, { recursive: true });
  return (await platformAudit(fluxiq.paths.fluxiq, platformDir)).sink;
}

/** Closes an already-open root audit after all workspaces have drained. Opens nothing at shutdown. */
export async function closePlatformServices(fluxiq: Awaited<ReturnType<typeof getFluxIQAfterReload>>): Promise<void> {
  const composition = compositions.get(fluxiq);
  try {
    if (composition) await composition;
  } finally {
    const key = path.resolve(fluxiq.paths.fluxiq);
    const pending = audits.get(key);
    if (pending) {
      const audit = await pending;
      try {
        await audit.sink.close();
      } finally {
        await audit.store.close();
        audits.delete(key);
        compositions.delete(fluxiq);
      }
    }
  }
}

async function platformComposition(): Promise<PlatformComposition> {
  const fluxiq = await getFluxIQAfterReload();
  const existing = compositions.get(fluxiq);
  if (existing !== undefined) return existing;
  const created = composePlatformServices(fluxiq);
  // A failed composition is not cached, so the next call tries again.
  created.catch(() => compositions.delete(fluxiq));
  compositions.set(fluxiq, created);
  return created;
}

async function composePlatformServices(fluxiq: Awaited<ReturnType<typeof getFluxIQAfterReload>>): Promise<PlatformComposition> {
  const layoutVersion = path.basename(fluxiq.paths.config) === "config.json" ? 2 : 1;
  const platformDir = path.join(fluxiq.paths.fluxiq, "platform");
  mkdirSync(platformDir, { recursive: true });
  const { sink: auditSink } = await platformAudit(fluxiq.paths.fluxiq, platformDir);
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

function platformAudit(fluxiqDir: string, platformDir: string): Promise<PlatformAudit> {
  const key = path.resolve(fluxiqDir);
  const existing = audits.get(key);
  if (existing) return existing;
  const pending = IamAuditStore.open(path.join(platformDir, "iam-audit.sqlite")).then((store) => ({
    store,
    sink: new BufferedIamAuditSink(store, { onError: () => console.warn("The IAM audit could not be written.") })
  }));
  audits.set(key, pending);
  void pending.catch(() => {
    if (audits.get(key) === pending) audits.delete(key);
  });
  return pending;
}
