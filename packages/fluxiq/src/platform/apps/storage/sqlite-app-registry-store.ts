import { parseAppInstallation, validateAppInstallationAgainstManifest, verifyAppManifest, type AppInstallationV1, type AppManifestV1 } from "@fluxiq/contracts/apps";
import { SQLiteRepository } from "../../../framework/persistence/repository/sqlite-repository.ts";
import { AppStoreError, type AppInstallationRevision, type AppMutationGuard, type AppRegistryStore } from "../model/index.ts";
import { AppRecords } from "./records.ts";
import { appRecordKey } from "./record-key.ts";

/** Immutable app versions and CAS installation consent, committed with their audit history. */
export class SQLiteAppRegistryStore implements AppRegistryStore {
  private readonly repository: SQLiteRepository;
  private readonly pending = new Set<Promise<unknown>>();
  private closed = false;

  constructor(options: { rootDir: string }) {
    if (typeof options.rootDir !== "string" || !options.rootDir.trim()) throw new AppStoreError("invalid_record");
    this.repository = new SQLiteRepository({ rootDir: options.rootDir, kind: "platform.apps" });
  }

  async registerManifest(input: AppManifestV1, guard: AppMutationGuard): Promise<"registered" | "existing"> {
    const manifest = await checkedManifest(copy(input));
    return this.transaction(async (records) => {
      const key = manifestKey(manifest);
      const existing = await records.get(key);
      await authorized(guard);
      if (existing !== null) {
        if ((await checkedManifest(existing)).manifestDigest !== manifest.manifestDigest) throw new AppStoreError("manifest_conflict");
        return "existing";
      }
      await records.insert(key, manifest, Date.now());
      return "registered";
    });
  }

  getManifest(identity: Pick<AppManifestV1, "publisherId" | "appId" | "version">): Promise<AppManifestV1 | null> {
    const key = manifestKey(identity);
    return this.transaction(async (records) => {
      const stored = await records.get(key);
      return stored === null ? null : checkedManifest(stored);
    });
  }

  async createInstallation(input: AppInstallationV1, actorUserId: string, guard: AppMutationGuard): Promise<boolean> {
    const record = checkedInstallation(copy(input));
    if (record.revision !== 1 || record.generation !== 1 || record.status !== "active" || record.installedByUserId !== actorUserId) throw new AppStoreError("invalid_record");
    return this.transaction(async (records) => {
      await this.checkManifest(records, record);
      const key = appRecordKey("installation", record.installationId);
      const previous = await records.get(key);
      await authorized(guard);
      if (previous !== null) return false;
      await records.insert(key, record, record.updatedAtMs);
      await records.insert(appRecordKey("workspace", record.workspaceId, record.installationId), { installationId: record.installationId }, record.updatedAtMs);
      await this.audit(records, record, actorUserId);
      return true;
    });
  }

  async replaceInstallation(input: AppInstallationV1, expectedRevision: number, actorUserId: string, guard: AppMutationGuard): Promise<boolean> {
    const record = checkedInstallation(copy(input));
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !actorUserId) throw new AppStoreError("invalid_record");
    return this.transaction(async (records) => {
      const key = appRecordKey("installation", record.installationId);
      const stored = await records.get(key);
      if (stored === null) return false;
      const previous = checkedInstallation(stored);
      if (previous.revision !== expectedRevision || previous.status !== "active") return false;
      if (record.revision !== previous.revision + 1 || record.generation !== previous.generation + 1 || record.workspaceId !== previous.workspaceId || record.app.publisherId !== previous.app.publisherId || record.app.appId !== previous.app.appId || record.installedByUserId !== previous.installedByUserId || record.installedAtMs !== previous.installedAtMs || record.updatedAtMs < previous.updatedAtMs) throw new AppStoreError("invalid_record");
      await this.checkManifest(records, record);
      await authorized(guard);
      await records.replace(key, record, record.updatedAtMs);
      await this.audit(records, record, actorUserId);
      return true;
    });
  }

  getInstallation(installationId: string): Promise<AppInstallationV1 | null> {
    const key = appRecordKey("installation", installationId);
    return this.transaction(async (records) => {
      const stored = await records.get(key);
      return stored === null ? null : checkedInstallation(stored);
    });
  }

  listInstallations(workspaceId: string): Promise<AppInstallationV1[]> {
    const prefix = `${appRecordKey("workspace", workspaceId)}/`;
    return this.transaction(async (records) => {
      const result: AppInstallationV1[] = [];
      for (const value of await records.list(prefix)) {
        if (!value || typeof value !== "object" || !("installationId" in value) || typeof value.installationId !== "string") throw new AppStoreError("invalid_record");
        const record = checkedInstallation(await records.get(appRecordKey("installation", value.installationId)));
        if (record.workspaceId !== workspaceId) throw new AppStoreError("invalid_record");
        result.push(record);
      }
      return result;
    });
  }

  history(installationId: string): Promise<AppInstallationRevision[]> {
    const prefix = `${appRecordKey("history", installationId)}/`;
    return this.transaction(async (records) => (await records.list(prefix)).map((value) => {
      if (!value || typeof value !== "object" || !("installation" in value) || !("actorUserId" in value) || typeof value.actorUserId !== "string" || !value.actorUserId || !("recordedAtMs" in value) || typeof value.recordedAtMs !== "number" || !Number.isSafeInteger(value.recordedAtMs) || value.recordedAtMs < 0) throw new AppStoreError("invalid_record");
      const installation = checkedInstallation(value.installation);
      if (installation.installationId !== installationId) throw new AppStoreError("invalid_record");
      return { installation, actorUserId: value.actorUserId, recordedAtMs: value.recordedAtMs };
    }));
  }

  async close(): Promise<void> {
    this.closed = true;
    const results = await Promise.allSettled([...this.pending]);
    if (results.some((result) => result.status === "rejected")) throw new AppStoreError("storage_unavailable");
  }

  private async checkManifest(records: AppRecords, record: AppInstallationV1): Promise<void> {
    const manifest = await checkedManifest(await records.get(manifestKey(record.app)));
    if (!validateAppInstallationAgainstManifest(record, manifest).ok) throw new AppStoreError("invalid_record");
  }

  private audit(records: AppRecords, installation: AppInstallationV1, actorUserId: string): Promise<void> {
    return records.insert(appRecordKey("history", installation.installationId, String(installation.revision).padStart(16, "0")), { installation, actorUserId, recordedAtMs: Date.now() }, installation.updatedAtMs);
  }

  private async transaction<T>(operation: (records: AppRecords) => Promise<T>): Promise<T> {
    if (this.closed) throw new AppStoreError("store_closed");
    const result = this.repository.transaction({}, (transaction) => operation(new AppRecords(transaction, this.repository.tableName))).catch((error: unknown) => {
      if (error instanceof AppStoreError) throw error;
      throw new AppStoreError("storage_unavailable");
    });
    this.pending.add(result);
    try { return await result; } finally { this.pending.delete(result); }
  }
}

function manifestKey(identity: Pick<AppManifestV1, "publisherId" | "appId" | "version">): string {
  return appRecordKey("manifest", identity.publisherId, identity.appId, identity.version);
}

async function checkedManifest(value: unknown): Promise<AppManifestV1> {
  const parsed = await verifyAppManifest(value);
  if (!parsed.ok) throw new AppStoreError("invalid_record");
  return parsed.value;
}

function checkedInstallation(value: unknown): AppInstallationV1 {
  const parsed = parseAppInstallation(value);
  if (!parsed.ok) throw new AppStoreError("invalid_record");
  return parsed.value;
}

async function authorized(guard: AppMutationGuard): Promise<void> {
  if (typeof guard !== "function") throw new AppStoreError("authority_changed");
  let allowed: boolean;
  try { allowed = await guard(); } catch { throw new AppStoreError("storage_unavailable"); }
  if (!allowed) throw new AppStoreError("authority_changed");
}

function copy<T>(value: T): T {
  try { return structuredClone(value); } catch { throw new AppStoreError("invalid_record"); }
}
