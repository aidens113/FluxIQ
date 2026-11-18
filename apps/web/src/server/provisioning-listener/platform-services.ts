import { mkdirSync } from "node:fs";
import path from "node:path";
import { SQLiteRepository } from "fluxiq/database-manager";
import { BufferedIamAuditSink, createPlatformServices, IamAuditStore, type IamAuditQuery, type IamAuditRecord, type PlatformServices } from "fluxiq/platform";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import type { FluxIQ } from "fluxiq";
import { getFluxIQAfterReload, getFluxIQWorkspaces, isCurrentFluxIQPrimary } from "../../lib/fluxiq";
import { primaryWorkspaceId } from "../../lib/workspaces";
import { resolveEmailSender } from "./resolve-email-sender";
import { closeKeySessionServices } from "../key-sessions";
import { closeBrowserTrustRepository, getBrowserTrustRepository } from "../browser-trust";
import { closeConnectServices } from "../connect";
import { composeCascadePorts, startDeletionSweep, type CascadePortSources, type DeletionSweep } from "./cascade";

// The platform services (account provisioning, the welcome and reset links)
// for the running web server: one composition per FluxIQ instance, built on
// first use and shared by the private provisioning listener and the account
// pages. The data lives beside the instance's other databases ("platform.store"
// and "platform.iam"); the IAM decision audit is the persistent compact store
// under `<fluxiq>/platform/iam-audit.sqlite`, written through one buffered sink
// that every workspace's registry records into under the service profile.
// Provisioning runs through the cascade ports (`./cascade`), so disabling,
// deleting and suspending reach paired browsers, key custody, billing and the
// workspace's data, and the deletion sweep finishes scheduled deletions.

type PlatformComposition = { services: PlatformServices; auditSink: BufferedIamAuditSink; sweep: DeletionSweep };
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

/** Only account read methods from the existing composition for this exact held primary. */
export async function platformReadStoreFor(primary: FluxIQ): Promise<Pick<PlatformServices["store"], "getAccount" | "getMembership" | "getWorkspace" | "listMembershipsOfWorkspace">> {
  const store = (await platformCompositionFor(primary)).services.store;
  return Object.freeze({
    getAccount: (userId: string) => store.getAccount(userId),
    getMembership: (workspaceId: string, userId: string) => store.getMembership(workspaceId, userId),
    getWorkspace: (workspaceId: string) => store.getWorkspace(workspaceId),
    listMembershipsOfWorkspace: (workspaceId: string) => store.listMembershipsOfWorkspace(workspaceId)
  });
}

/** The buffered IAM decision audit the platform services write to; the workspace manager's registries record into it too. */
export async function getPlatformIamAuditSink(): Promise<BufferedIamAuditSink> {
  const fluxiq = await getFluxIQAfterReload({ allowDuringShutdown: true });
  const platformDir = path.join(fluxiq.paths.fluxiq, "platform");
  mkdirSync(platformDir, { recursive: true });
  return (await platformAudit(fluxiq.paths.fluxiq, platformDir)).sink;
}

/**
 * Reads the platform IAM audit, newest first, for the Security screen's
 * Activity route. It flushes the buffered sink first so the last second's
 * decisions are included; a failed flush is the sink's to report (it keeps the
 * rows and throws from its own next flush) and does not stop the read.
 */
export async function readPlatformIamAudit(query: IamAuditQuery): Promise<IamAuditRecord[]> {
  const fluxiq = await getFluxIQAfterReload({ allowDuringShutdown: true });
  const platformDir = path.join(fluxiq.paths.fluxiq, "platform");
  mkdirSync(platformDir, { recursive: true });
  const audit = await platformAudit(fluxiq.paths.fluxiq, platformDir);
  await audit.sink.flush().catch(/* best-effort: the sink keeps the rows and throws from its next flush */ () => undefined);
  return audit.store.read(query);
}

/**
 * A read port for one already-held primary identity/runtime. It captures the
 * existing root audit owner once; batches never select a replacement primary.
 * The caller owns the primary lease and current-runtime checks around reads.
 */
export async function platformIamAuditReaderFor(primary: FluxIQ): Promise<{ read(query: IamAuditQuery): Promise<IamAuditRecord[]> }> {
  const fluxiqDir = primary.paths.fluxiq;
  const platformDir = path.join(fluxiqDir, "platform");
  mkdirSync(platformDir, { recursive: true });
  const audit = await platformAudit(fluxiqDir, platformDir);
  return Object.freeze({
    read: async (query: IamAuditQuery) => {
      await audit.sink.flush().catch(/* best-effort: the shared sink retains failed rows for its next flush */ () => undefined);
      return audit.store.read(query);
    }
  });
}

/** Closes an already-open root audit after all workspaces have drained. Opens nothing at shutdown. */
export async function closePlatformServices(fluxiq: Awaited<ReturnType<typeof getFluxIQAfterReload>>): Promise<void> {
  const composition = compositions.get(fluxiq);
  try {
    // The sweep stops first, waiting for a pass in flight, so no deletion runs while the stores close.
    const swept = composition ? await Promise.allSettled([composition.then((composed) => composed.sweep.stop())]) : [];
    const closed = await Promise.allSettled([closeKeySessionServices(fluxiq.paths.fluxiq), closeBrowserTrustRepository(fluxiq.paths.fluxiq), closeConnectServices(fluxiq.paths.fluxiq)]);
    const failures = [...swept, ...closed].filter((outcome) => outcome.status === "rejected");
    if (composition) await composition;
    if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), "Platform credential authorities could not all close cleanly.");
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
  return platformCompositionFor(fluxiq);
}

function platformCompositionFor(fluxiq: FluxIQ): Promise<PlatformComposition> {
  const existing = compositions.get(fluxiq);
  if (existing !== undefined) return existing;
  const created = composePlatformServices(fluxiq);
  // A failed composition is not cached, so the next call tries again.
  created.catch(() => compositions.delete(fluxiq));
  compositions.set(fluxiq, created);
  return created;
}

/**
 * Where the cascade ports reach for one primary: the running workspace
 * manager, the platform store once composed, the browser-trust authority
 * under the primary's root, and the commerce billing service when this
 * server bills (loaded on use, so a server that bills nothing never loads it).
 */
function cascadeSources(fluxiq: FluxIQ, store: () => Promise<PlatformServices["store"]>): CascadePortSources {
  const manager = getFluxIQWorkspaces();
  return {
    primary: fluxiq,
    manager: () => getFluxIQWorkspaces(),
    current: () => isCurrentFluxIQPrimary(fluxiq) && getFluxIQWorkspaces() === manager,
    store,
    listActiveForUser: (userId) => getBrowserTrustRepository(fluxiq.paths.fluxiq).listActiveForUser(userId),
    billing: async () => (await import("../commerce")).getCommerceBilling()
  };
}

async function composePlatformServices(fluxiq: Awaited<ReturnType<typeof getFluxIQAfterReload>>): Promise<PlatformComposition> {
  const layoutVersion = path.basename(fluxiq.paths.config) === "config.json" ? 2 : 1;
  const platformDir = path.join(fluxiq.paths.fluxiq, "platform");
  mkdirSync(platformDir, { recursive: true });
  const { sink: auditSink } = await platformAudit(fluxiq.paths.fluxiq, platformDir);
  let composed: PlatformServices | null = null;
  const store = async () => {
    if (composed === null) throw new Error("platform.not_composed: the platform store is not ready yet.");
    return composed.store;
  };
  const services = await createPlatformServices({
    ...composeCascadePorts(cascadeSources(fluxiq, store)),
    repository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.store", layoutVersion }),
    iamRepository: new SQLiteRepository({ rootDir: fluxiq.paths.databases, kind: "platform.iam", layoutVersion }),
    identity: fluxiq.programs.identityAccess,
    email: resolveEmailSender(process.env.FLUXIQ_EMAIL_SENDER, path.join(platformDir, "outbox")),
    auditSink,
    publicOrigin: resolveFluxIQDeploymentSettings(process.env).publicOrigin,
    tenancy: getFluxIQWorkspaces().tenancy === "multi" ? { mode: "multi" } : { mode: "single", workspaceId: primaryWorkspaceId() }
  });
  composed = services;
  // Every profile can hold a scheduled deletion (the operator's command line makes one anywhere), so the sweep runs on each.
  const sweep = startDeletionSweep(services.provisioning);
  return { services, auditSink, sweep };
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
