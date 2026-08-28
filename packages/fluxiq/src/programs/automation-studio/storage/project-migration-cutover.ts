import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../model/index.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./project-administration.ts";
import { AutomationStudioProjectEventChunkStore, type AutomationStudioChunkEvent, type AutomationStudioEventStreamKind } from "./project-event-chunk-store.ts";
import { AutomationStudioProjectGraphRepository } from "./project-graph-store.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./project-database.ts";
import { migrateAutomationStudioLegacyObjectIndex, type AutomationStudioLegacyObjectIndexMigrationResult } from "./project-object-index-migration.ts";
import { AutomationStudioSchemaMigrationRunner, type AutomationStudioSchemaMigration } from "./schema-migrations.ts";

export const AUTOMATION_STUDIO_V2_STORAGE_FEATURE = "automation_studio_v2_storage" as const;

export const AUTOMATION_STUDIO_LEGACY_RESOURCE_KINDS = [
  "project_catalog",
  "project_hierarchy",
  "flow_documents",
  "subflows",
  "router_maps",
  "instructions",
  "adaptations",
  "runtime_runs",
  "runtime_events",
  "recordings",
  "recording_events",
  "state_index",
  "object_index",
  "settings",
  "publications"
] as const;

export type AutomationStudioLegacyResourceKind = typeof AUTOMATION_STUDIO_LEGACY_RESOURCE_KINDS[number];
export type AutomationStudioLegacyMigrationOperationKind = "catalog_import" | "hierarchy_import" | "resource_import" | "graph_split" | "runtime_stream_chunk" | "recording_stream_chunk" | "object_reference";
export type AutomationStudioMigrationManifestKind = "inventory" | "backup" | "verification" | "hybrid_read" | "cutover";
export type AutomationStudioV2CutoverState = "disabled" | "enabled" | "default" | "rolled_back";

export type AutomationStudioLegacyResourceInventoryItem = {
  resourceKind: AutomationStudioLegacyResourceKind;
  resourceId: string;
  relativePath: string;
  byteCount: number;
  modifiedAt: number;
  sha256: string | null;
};

export type AutomationStudioLegacyInventoryManifest = {
  schemaVersion: "automation-studio.legacy-inventory.v1";
  projectId: string;
  createdAt: number;
  rootRelativePath: string;
  resources: AutomationStudioLegacyResourceInventoryItem[];
  resourceCounts: Record<AutomationStudioLegacyResourceKind, number>;
  fileCount: number;
  totalBytes: number;
  digest: string;
};

export type AutomationStudioLegacyBackupManifest = Omit<AutomationStudioLegacyInventoryManifest, "schemaVersion"> & {
  schemaVersion: "automation-studio.legacy-backup-manifest.v1";
  backupId: string;
  manifestPath: string;
  verifiedAt: number | null;
};

export type AutomationStudioLegacyBackupVerification = {
  ok: boolean;
  projectId: string;
  backupId: string;
  checkedAt: number;
  expectedDigest: string;
  actualDigest: string;
  missing: string[];
  changed: Array<{ relativePath: string; expectedSha256: string | null; actualSha256: string | null }>;
};

export type AutomationStudioLegacyMigrationOperation = {
  operationKind: AutomationStudioLegacyMigrationOperationKind;
  resourceKind: AutomationStudioLegacyResourceKind;
  resourceId: string;
  relativePath: string;
};

export type AutomationStudioLegacyImporterBatchResult = {
  resourceKind: AutomationStudioLegacyResourceKind;
  resourceId: string;
  status: "pending" | "done" | "failed";
  importedCount: number;
  skippedCount: number;
  nextIndex: number;
  total: number;
  error: string | null;
};

export type AutomationStudioLegacyMigrationOrchestrationResult = {
  inventory: AutomationStudioLegacyInventoryManifest;
  backup: AutomationStudioLegacyBackupManifest | null;
  operations: AutomationStudioLegacyMigrationOperation[];
  importerResults: AutomationStudioLegacyImporterBatchResult[];
  objectMigration: AutomationStudioLegacyObjectIndexMigrationResult | null;
};

export type AutomationStudioMigrationVerificationReport = {
  schemaVersion: "automation-studio.migration-verification.v1";
  projectId: string;
  checkedAt: number;
  counts: Record<string, number>;
  countMismatches: Array<{ resourceKind: AutomationStudioLegacyResourceKind; legacyCount: number; v2Count: number }>;
  referenceIssues: Array<{ code: string; count: number }>;
  semanticIssues: Array<{ code: string; detail: string }>;
  digest: string;
  ok: boolean;
};

export type AutomationStudioHybridReadComparison = {
  schemaVersion: "automation-studio.hybrid-read-comparison.v1";
  ownerKind: string;
  ownerId: string;
  comparedAt: number;
  legacyDigest: string;
  v2Digest: string;
  match: boolean;
  diagnostics: string[];
  readOnly: boolean;
};

export type AutomationStudioMigrationManifestRecord = {
  manifestId: string;
  manifestKind: AutomationStudioMigrationManifestKind;
  projectId: string;
  digest: string;
  fileCount: number;
  totalBytes: number;
  payload: JsonObject;
  createdAt: number;
  verifiedAt: number | null;
};

export type AutomationStudioLegacyImportProgress = {
  resourceKind: AutomationStudioLegacyResourceKind;
  resourceId: string;
  cursor: JsonObject;
  status: "pending" | "running" | "done" | "failed";
  importedCount: number;
  skippedCount: number;
  error: string | null;
  updatedAt: number;
};

export type AutomationStudioV2FeatureState = {
  featureName: string;
  state: AutomationStudioV2CutoverState;
  defaultEnabled: boolean;
  previousState: JsonObject | null;
  reason: string;
  updatedAt: number;
};

export const AUTOMATION_STUDIO_PROJECT_MIGRATION_CUTOVER_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0011_migration_cutover",
  statements: [
    `create table if not exists legacy_migration_manifests (
      manifest_id text primary key,
      manifest_kind text not null check (manifest_kind in ('inventory', 'backup', 'verification', 'hybrid_read', 'cutover')),
      project_id text not null,
      digest text not null,
      file_count integer not null default 0 check (file_count >= 0),
      total_bytes integer not null default 0 check (total_bytes >= 0),
      payload_json text not null,
      created_at_ms integer not null,
      verified_at_ms integer
    )`,
    "create index if not exists legacy_migration_manifests_project_idx on legacy_migration_manifests (project_id, manifest_kind, created_at_ms desc, manifest_id)",
    `create table if not exists legacy_resource_imports (
      resource_kind text not null,
      resource_id text not null,
      cursor_json text not null default '{}',
      status text not null check (status in ('pending', 'running', 'done', 'failed')),
      imported_count integer not null default 0 check (imported_count >= 0),
      skipped_count integer not null default 0 check (skipped_count >= 0),
      error_json text,
      updated_at_ms integer not null,
      primary key (resource_kind, resource_id)
    )`,
    "create index if not exists legacy_resource_imports_status_idx on legacy_resource_imports (status, updated_at_ms, resource_kind, resource_id)",
    `create table if not exists migration_cutover_state (
      feature_name text primary key,
      state text not null check (state in ('disabled', 'enabled', 'default', 'rolled_back')),
      default_enabled integer not null default 0 check (default_enabled in (0, 1)),
      previous_state_json text,
      reason text not null default '',
      updated_at_ms integer not null
    )`
  ]
};

const CUTOVER_MIGRATIONS = [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_PROJECT_MIGRATION_CUTOVER_MIGRATION] as const;

export class AutomationStudioProjectMigrationCutoverStore {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectMigrationCutoverStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: CUTOVER_MIGRATIONS }).migrate();
      return new AutomationStudioProjectMigrationCutoverStore(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> { return this.lease.release(); }
  get sql(): AutomationStudioSqlExecutor { return this.lease.database; }

  async putManifest(input: Omit<AutomationStudioMigrationManifestRecord, "createdAt" | "verifiedAt"> & { createdAt?: number; verifiedAt?: number | null }): Promise<AutomationStudioMigrationManifestRecord> {
    const now = input.createdAt ?? Date.now();
    await this.sql.run(
      `insert into legacy_migration_manifests (manifest_id, manifest_kind, project_id, digest, file_count, total_bytes, payload_json, created_at_ms, verified_at_ms)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(manifest_id) do update set manifest_kind = excluded.manifest_kind, digest = excluded.digest, file_count = excluded.file_count,
         total_bytes = excluded.total_bytes, payload_json = excluded.payload_json, verified_at_ms = excluded.verified_at_ms`,
      [requiredId(input.manifestId, "manifest"), input.manifestKind, this.lease.projectId, requiredDigest(input.digest), nonNegative(input.fileCount, "file count"), nonNegative(input.totalBytes, "total bytes"), stableStringify(input.payload), now, input.verifiedAt ?? null]
    );
    return required(await this.getManifest(input.manifestId), `Migration manifest ${input.manifestId} was not persisted.`);
  }

  async getManifest(manifestId: string): Promise<AutomationStudioMigrationManifestRecord | null> {
    const row = await this.sql.get<ManifestRow>("select * from legacy_migration_manifests where manifest_id = ?", [requiredId(manifestId, "manifest")]);
    return row ? manifestFromRow(row) : null;
  }

  async listManifests(input: { kind?: AutomationStudioMigrationManifestKind; limit?: number } = {}): Promise<AutomationStudioMigrationManifestRecord[]> {
    const rows = await this.sql.all<ManifestRow>(
      `select * from legacy_migration_manifests where project_id = ?${input.kind ? " and manifest_kind = ?" : ""} order by created_at_ms desc, manifest_id desc limit ?`,
      [this.lease.projectId, ...(input.kind ? [input.kind] : []), clampLimit(input.limit)]
    );
    return rows.map(manifestFromRow);
  }

  async upsertImportProgress(input: Omit<AutomationStudioLegacyImportProgress, "updatedAt"> & { updatedAt?: number }): Promise<AutomationStudioLegacyImportProgress> {
    const now = input.updatedAt ?? Date.now();
    await this.sql.run(
      `insert into legacy_resource_imports (resource_kind, resource_id, cursor_json, status, imported_count, skipped_count, error_json, updated_at_ms)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(resource_kind, resource_id) do update set cursor_json = excluded.cursor_json, status = excluded.status,
         imported_count = excluded.imported_count, skipped_count = excluded.skipped_count, error_json = excluded.error_json, updated_at_ms = excluded.updated_at_ms`,
      [requiredResourceKind(input.resourceKind), requiredId(input.resourceId, "legacy resource"), stableStringify(input.cursor), input.status, nonNegative(input.importedCount, "imported count"), nonNegative(input.skippedCount, "skipped count"), input.error, now]
    );
    return required(await this.getImportProgress(input.resourceKind, input.resourceId), `Legacy import progress ${input.resourceKind}:${input.resourceId} was not persisted.`);
  }

  async getImportProgress(resourceKind: AutomationStudioLegacyResourceKind, resourceId: string): Promise<AutomationStudioLegacyImportProgress | null> {
    const row = await this.sql.get<ImportProgressRow>("select * from legacy_resource_imports where resource_kind = ? and resource_id = ?", [requiredResourceKind(resourceKind), requiredId(resourceId, "legacy resource")]);
    return row ? importProgressFromRow(row) : null;
  }

  async setFeatureState(input: { state: AutomationStudioV2CutoverState; defaultEnabled?: boolean; reason?: string; now?: number }): Promise<AutomationStudioV2FeatureState> {
    const previous = await this.getFeatureState();
    const now = input.now ?? Date.now();
    const previousState = previous ? stableStringify(previous as unknown as JsonObject) : null;
    const defaultEnabled = input.defaultEnabled ?? previous?.defaultEnabled === true;
    await this.sql.run(
      `insert into migration_cutover_state (feature_name, state, default_enabled, previous_state_json, reason, updated_at_ms)
       values (?, ?, ?, ?, ?, ?)
       on conflict(feature_name) do update set state = excluded.state, default_enabled = excluded.default_enabled,
         previous_state_json = excluded.previous_state_json, reason = excluded.reason, updated_at_ms = excluded.updated_at_ms`,
      [AUTOMATION_STUDIO_V2_STORAGE_FEATURE, input.state, defaultEnabled ? 1 : 0, previousState, input.reason ?? "", now]
    );
    return required(await this.getFeatureState(), "Automation Studio v2 feature state was not persisted.");
  }

  async getFeatureState(): Promise<AutomationStudioV2FeatureState | null> {
    const row = await this.sql.get<CutoverStateRow>("select * from migration_cutover_state where feature_name = ?", [AUTOMATION_STUDIO_V2_STORAGE_FEATURE]);
    return row ? cutoverStateFromRow(row) : null;
  }

  async enableV2ForNewProjects(reason = "enabled for new projects", now?: number): Promise<AutomationStudioV2FeatureState> {
    return this.setFeatureState({ state: "enabled", defaultEnabled: false, reason, ...(now === undefined ? {} : { now }) });
  }

  async makeV2Default(reason = "v2 storage is default", now?: number): Promise<AutomationStudioV2FeatureState> {
    return this.setFeatureState({ state: "default", defaultEnabled: true, reason, ...(now === undefined ? {} : { now }) });
  }

  async rollbackV2(reason = "rolled back to legacy compatibility", now?: number): Promise<AutomationStudioV2FeatureState> {
    return this.setFeatureState({ state: "rolled_back", defaultEnabled: false, reason, ...(now === undefined ? {} : { now }) });
  }
}

export async function inventoryAutomationStudioLegacyProject(input: { rootDir: string; projectId: string; includeContentDigests?: boolean; now?: number; maxFiles?: number }): Promise<AutomationStudioLegacyInventoryManifest> {
  const rootDir = path.resolve(input.rootDir);
  const projectId = requiredId(input.projectId, "project");
  const files = await collectLegacyFiles(rootDir, projectId, input.maxFiles ?? 50_000);
  const resources: AutomationStudioLegacyResourceInventoryItem[] = [];
  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    const stats = await stat(absolutePath);
    const resourceKind = classifyLegacyResource(file);
    resources.push({
      resourceKind,
      resourceId: legacyResourceId(resourceKind, file),
      relativePath: file.replaceAll(path.sep, "/"),
      byteCount: stats.size,
      modifiedAt: Math.trunc(stats.mtimeMs),
      sha256: input.includeContentDigests === true ? await sha256File(absolutePath) : null
    });
  }
  resources.sort(compareInventoryItems);
  const resourceCounts = countResources(resources);
  const totalBytes = resources.reduce((sum, resource) => sum + resource.byteCount, 0);
  const base = { projectId, createdAt: input.now ?? Date.now(), rootRelativePath: `projects/${projectId}`, resources, resourceCounts, fileCount: resources.length, totalBytes };
  return { schemaVersion: "automation-studio.legacy-inventory.v1", ...base, digest: digest(base) };
}

export async function createAutomationStudioVerifiedBackupManifest(input: { rootDir: string; projectId: string; backupId?: string; now?: number }): Promise<AutomationStudioLegacyBackupManifest> {
  const now = input.now ?? Date.now();
  const projectId = requiredId(input.projectId, "project");
  const backupId = requiredId(input.backupId ?? `backup.${now}`, "backup");
  const inventory = await inventoryAutomationStudioLegacyProject({ rootDir: input.rootDir, projectId, includeContentDigests: true, now });
  const manifestPath = path.join("projects", projectId, "backups", backupId, "manifest.json").replaceAll(path.sep, "/");
  const manifest: AutomationStudioLegacyBackupManifest = { ...inventory, schemaVersion: "automation-studio.legacy-backup-manifest.v1", backupId, manifestPath, verifiedAt: null };
  const absoluteManifestPath = path.join(path.resolve(input.rootDir), manifestPath);
  await mkdir(path.dirname(absoluteManifestPath), { recursive: true });
  await writeFile(absoluteManifestPath, stableStringify(manifest), "utf8");
  const verification = await verifyAutomationStudioBackupManifest({ rootDir: input.rootDir, manifest, now });
  const verified = { ...manifest, verifiedAt: verification.checkedAt } satisfies AutomationStudioLegacyBackupManifest;
  await writeFile(absoluteManifestPath, stableStringify(verified), "utf8");
  return verified;
}

export async function verifyAutomationStudioBackupManifest(input: { rootDir: string; manifest?: AutomationStudioLegacyBackupManifest; manifestPath?: string; now?: number }): Promise<AutomationStudioLegacyBackupVerification> {
  const manifest = input.manifest ?? JSON.parse(await readFile(path.resolve(input.rootDir, requiredRelativePath(input.manifestPath ?? "")), "utf8")) as AutomationStudioLegacyBackupManifest;
  const rootDir = path.resolve(input.rootDir);
  const checkedAt = input.now ?? Date.now();
  const missing: string[] = [];
  const changed: AutomationStudioLegacyBackupVerification["changed"] = [];
  const resources: AutomationStudioLegacyResourceInventoryItem[] = [];
  for (const resource of manifest.resources) {
    const absolutePath = path.join(rootDir, requiredRelativePath(resource.relativePath));
    const stats = await stat(absolutePath).catch(() => null);
    if (!stats) {
      missing.push(resource.relativePath);
      continue;
    }
    const actualSha256 = await sha256File(absolutePath);
    if (resource.sha256 !== actualSha256 || resource.byteCount !== stats.size) changed.push({ relativePath: resource.relativePath, expectedSha256: resource.sha256, actualSha256 });
    resources.push({ ...resource, byteCount: stats.size, modifiedAt: Math.trunc(stats.mtimeMs), sha256: actualSha256 });
  }
  const actual = {
    projectId: manifest.projectId,
    createdAt: manifest.createdAt,
    rootRelativePath: manifest.rootRelativePath,
    resources: resources.sort(compareInventoryItems),
    resourceCounts: countResources(resources),
    fileCount: resources.length,
    totalBytes: resources.reduce((sum, resource) => sum + resource.byteCount, 0)
  };
  const actualDigest = digest(actual);
  return { ok: missing.length === 0 && changed.length === 0 && actualDigest === manifest.digest, projectId: manifest.projectId, backupId: manifest.backupId, checkedAt, expectedDigest: manifest.digest, actualDigest, missing, changed };
}

export function buildAutomationStudioLegacyMigrationOperations(manifest: AutomationStudioLegacyInventoryManifest): AutomationStudioLegacyMigrationOperation[] {
  return manifest.resources.map((resource) => ({
    operationKind: migrationOperationKind(resource.resourceKind, resource.relativePath),
    resourceKind: resource.resourceKind,
    resourceId: resource.resourceId,
    relativePath: resource.relativePath
  })).sort((left, right) => operationRank(left.operationKind) - operationRank(right.operationKind) || left.relativePath.localeCompare(right.relativePath));
}

export async function runAutomationStudioLegacyImporterBatch<T>(input: {
  store: AutomationStudioProjectMigrationCutoverStore;
  resourceKind: AutomationStudioLegacyResourceKind;
  resourceId: string;
  items: readonly T[];
  batchSize?: number;
  importItem: (item: T, index: number) => Promise<"imported" | "skipped">;
}): Promise<AutomationStudioLegacyImporterBatchResult> {
  const existing = await input.store.getImportProgress(input.resourceKind, input.resourceId);
  const startIndex = Math.max(0, Math.trunc(numberFromJson(existing?.cursor.nextIndex) ?? 0));
  const batchSize = Math.max(1, Math.min(500, Math.trunc(input.batchSize ?? 100)));
  let importedCount = existing?.importedCount ?? 0;
  let skippedCount = existing?.skippedCount ?? 0;
  let nextIndex = startIndex;
  await input.store.upsertImportProgress({ resourceKind: input.resourceKind, resourceId: input.resourceId, cursor: { nextIndex }, status: "running", importedCount, skippedCount, error: null });
  try {
    for (; nextIndex < input.items.length && nextIndex < startIndex + batchSize; nextIndex += 1) {
      const result = await input.importItem(input.items[nextIndex]!, nextIndex);
      if (result === "imported") importedCount += 1;
      else skippedCount += 1;
      await input.store.upsertImportProgress({ resourceKind: input.resourceKind, resourceId: input.resourceId, cursor: { nextIndex: nextIndex + 1 }, status: nextIndex + 1 >= input.items.length ? "done" : "pending", importedCount, skippedCount, error: null });
    }
    const status = nextIndex >= input.items.length ? "done" : "pending";
    await input.store.upsertImportProgress({ resourceKind: input.resourceKind, resourceId: input.resourceId, cursor: { nextIndex }, status, importedCount, skippedCount, error: null });
    return { resourceKind: input.resourceKind, resourceId: input.resourceId, status, importedCount, skippedCount, nextIndex, total: input.items.length, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await input.store.upsertImportProgress({ resourceKind: input.resourceKind, resourceId: input.resourceId, cursor: { nextIndex }, status: "failed", importedCount, skippedCount, error: message });
    return { resourceKind: input.resourceKind, resourceId: input.resourceId, status: "failed", importedCount, skippedCount, nextIndex, total: input.items.length, error: message };
  }
}

export async function runAutomationStudioLegacyMigrationOrchestration(input: {
  rootDir: string;
  pool: AutomationStudioProjectDatabasePool;
  projectId: string;
  backup?: boolean;
  batchSize?: number;
  importers?: Partial<Record<AutomationStudioLegacyResourceKind, (resource: AutomationStudioLegacyResourceInventoryItem) => Promise<"imported" | "skipped">>>;
  now?: number;
}): Promise<AutomationStudioLegacyMigrationOrchestrationResult> {
  const inventory = await inventoryAutomationStudioLegacyProject({ rootDir: input.rootDir, projectId: input.projectId, includeContentDigests: true, ...(input.now === undefined ? {} : { now: input.now }) });
  const backup = input.backup === false ? null : await createAutomationStudioVerifiedBackupManifest({ rootDir: input.rootDir, projectId: input.projectId, backupId: `backup.${input.now ?? Date.now()}`, ...(input.now === undefined ? {} : { now: input.now }) });
  const operations = buildAutomationStudioLegacyMigrationOperations(inventory);
  const store = await AutomationStudioProjectMigrationCutoverStore.open({ pool: input.pool, projectId: input.projectId });
  const importerResults: AutomationStudioLegacyImporterBatchResult[] = [];
  let objectMigration: AutomationStudioLegacyObjectIndexMigrationResult | null = null;
  try {
    for (const resourceKind of AUTOMATION_STUDIO_LEGACY_RESOURCE_KINDS) {
      const resources = inventory.resources.filter((resource) => resource.resourceKind === resourceKind);
      if (!resources.length) continue;
      if (resourceKind === "object_index") objectMigration = await migrateAutomationStudioLegacyObjectIndex({ rootDir: input.rootDir, pool: input.pool, projectId: input.projectId, verifyFiles: false });
      const importItem = input.importers?.[resourceKind] ?? ((resource: AutomationStudioLegacyResourceInventoryItem) => importLegacyResource({ rootDir: input.rootDir, pool: input.pool, projectId: input.projectId, resource }));
      importerResults.push(await runAutomationStudioLegacyImporterBatch({ store, resourceKind, resourceId: `legacy.${resourceKind}`, items: resources, importItem, ...(input.batchSize === undefined ? {} : { batchSize: input.batchSize }) }));
    }
    await store.putManifest({ manifestId: `inventory.${inventory.digest.slice(7, 23)}`, manifestKind: "inventory", projectId: input.projectId, digest: inventory.digest, fileCount: inventory.fileCount, totalBytes: inventory.totalBytes, payload: inventory as unknown as JsonObject, ...(input.now === undefined ? {} : { createdAt: input.now }) });
    if (backup) await store.putManifest({ manifestId: backup.backupId, manifestKind: "backup", projectId: input.projectId, digest: backup.digest, fileCount: backup.fileCount, totalBytes: backup.totalBytes, payload: backup as unknown as JsonObject, ...(input.now === undefined ? {} : { createdAt: input.now }), verifiedAt: backup.verifiedAt });
    return { inventory, backup, operations, importerResults, objectMigration };
  } finally {
    await store.close();
  }
}

export async function verifyAutomationStudioV2Migration(input: { sql: AutomationStudioSqlExecutor; projectId: string; legacyInventory?: AutomationStudioLegacyInventoryManifest; now?: number }): Promise<AutomationStudioMigrationVerificationReport> {
  const counts: Record<string, number> = {};
  for (const table of ["flows", "subflows", "routers", "router_routes", "instructions", "runtime_runs", "runtime_event_chunks", "recordings", "recording_event_chunks", "state_snapshots", "adaptations", "objects", "object_references", "graph_nodes", "graph_edges", "graph_revisions"]) {
    counts[table] = await tableCount(input.sql, table);
  }
  const referenceIssues = await referenceVerification(input.sql);
  const semanticIssues = await semanticVerification(input.sql);
  const countMismatches = input.legacyInventory ? legacyCountMismatches(input.legacyInventory, counts) : [];
  const reportBase = { projectId: input.projectId, checkedAt: input.now ?? Date.now(), counts, countMismatches, referenceIssues, semanticIssues };
  return { schemaVersion: "automation-studio.migration-verification.v1", ...reportBase, digest: digest(reportBase), ok: countMismatches.length === 0 && referenceIssues.every((issue) => issue.count === 0) && semanticIssues.length === 0 };
}

export async function compareAutomationStudioHybridRead(input: { ownerKind: string; ownerId: string; legacyRead: () => Promise<unknown>; v2Read: () => Promise<unknown>; sql?: AutomationStudioSqlExecutor; now?: number }): Promise<AutomationStudioHybridReadComparison> {
  const before = input.sql ? await mutationCounters(input.sql) : null;
  const [legacyValue, v2Value] = await Promise.all([input.legacyRead(), input.v2Read()]);
  const after = input.sql ? await mutationCounters(input.sql) : null;
  const legacyDigest = digest(legacyValue);
  const v2Digest = digest(v2Value);
  const diagnostics: string[] = [];
  if (legacyDigest !== v2Digest) diagnostics.push("hybrid_read.digest_mismatch");
  const readOnly = !before || !after || before.changeFeed === after.changeFeed && before.migrationJobs === after.migrationJobs && before.mutationRecords === after.mutationRecords;
  if (!readOnly) diagnostics.push("hybrid_read.performed_write");
  return { schemaVersion: "automation-studio.hybrid-read-comparison.v1", ownerKind: requiredKind(input.ownerKind, "owner kind"), ownerId: requiredId(input.ownerId, "owner"), comparedAt: input.now ?? Date.now(), legacyDigest, v2Digest, match: legacyDigest === v2Digest, diagnostics, readOnly };
}

export function resolveAutomationStudioV2Feature(input: { state?: AutomationStudioV2FeatureState | null; explicitEnabled?: boolean; newProject?: boolean; defaultEnabled?: boolean } = {}): boolean {
  if (input.explicitEnabled !== undefined) return input.explicitEnabled;
  if (input.state?.state === "rolled_back" || input.state?.state === "disabled") return false;
  if (input.state?.state === "default") return true;
  if (input.state?.state === "enabled") return input.newProject === true;
  return input.defaultEnabled === true;
}

export const AUTOMATION_STUDIO_RETIRED_ACTIVE_JSON_INDEXES = Object.freeze([
  "indexes/flows.json",
  "indexes/subflows.json",
  "indexes/instructions.json",
  "indexes/runs.json",
  "indexes/adaptations.json",
  "indexes/objects.json"
] as const);

export const AUTOMATION_STUDIO_LEGACY_REPAIR_ENDPOINTS = Object.freeze(["repair-recording-state-index"] as const);

export function assertAutomationStudioReadPathDoesNotRepair(endpoint: string): void {
  if ((AUTOMATION_STUDIO_LEGACY_REPAIR_ENDPOINTS as readonly string[]).includes(endpoint)) {
    throw new Error(`Read-time repair endpoint ${endpoint} is retired; run an explicit migration job instead.`);
  }
}

async function importLegacyResource(input: { rootDir: string; pool: AutomationStudioProjectDatabasePool; projectId: string; resource: AutomationStudioLegacyResourceInventoryItem }): Promise<"imported" | "skipped"> {
  if (input.resource.resourceKind === "flow_documents") return importLegacyFlowGraph(input);
  if (input.resource.resourceKind === "runtime_events") return importLegacyEventStream({ ...input, streamKind: "runtime" });
  if (input.resource.resourceKind === "recording_events") return importLegacyEventStream({ ...input, streamKind: "recording" });
  return "skipped";
}

async function importLegacyFlowGraph(input: { rootDir: string; pool: AutomationStudioProjectDatabasePool; projectId: string; resource: AutomationStudioLegacyResourceInventoryItem }): Promise<"imported" | "skipped"> {
  const parsed = JSON.parse(await readFile(path.join(path.resolve(input.rootDir), requiredRelativePath(input.resource.relativePath)), "utf8")) as Partial<AutomationStudioFlowArtifact>;
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return "skipped";
  const flow = legacyFlowArtifact(parsed, input.projectId, path.basename(path.dirname(input.resource.relativePath)));
  const graph = await AutomationStudioProjectGraphRepository.open({ pool: input.pool, projectId: input.projectId });
  try {
    const result = await graph.importMonolithicFlowGraph(flow, { changedAt: flow.updatedAt });
    return result.status === "imported" ? "imported" : "skipped";
  } finally {
    await graph.close();
  }
}

async function importLegacyEventStream(input: { rootDir: string; pool: AutomationStudioProjectDatabasePool; projectId: string; resource: AutomationStudioLegacyResourceInventoryItem; streamKind: AutomationStudioEventStreamKind }): Promise<"imported" | "skipped"> {
  const streamId = legacyStreamId(input.resource.relativePath, input.streamKind);
  const events = parseJsonlEvents(await readFile(path.join(path.resolve(input.rootDir), requiredRelativePath(input.resource.relativePath)), "utf8"));
  if (!events.length) return "skipped";
  const ownerStore = await AutomationStudioProjectMigrationCutoverStore.open({ pool: input.pool, projectId: input.projectId });
  try {
    await ensureStreamOwner(ownerStore.sql, input.streamKind, streamId, eventTimestamp(events[0]) ?? Date.now());
  } finally {
    await ownerStore.close();
  }
  const chunks = await AutomationStudioProjectEventChunkStore.open({ pool: input.pool, projectId: input.projectId });
  try {
    const existingChunk = await chunks.getChunk({ streamKind: input.streamKind, chunkId: `chunk:${input.streamKind}:${streamId}:1` });
    if (existingChunk) return "skipped";
    await chunks.writeChunk({ streamKind: input.streamKind, streamId, events, maxEvents: 2_000 });
    return "imported";
  } finally {
    await chunks.close();
  }
}

async function ensureStreamOwner(sql: AutomationStudioSqlExecutor, streamKind: AutomationStudioEventStreamKind, streamId: string, now: number): Promise<void> {
  if (streamKind === "runtime") {
    await sql.run(`insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms)
      values ('legacy.runtime', 'Legacy Runtime Import', 'global', 'private', 'import', 'visual', 'draft', ?, ?) on conflict(flow_id) do nothing`, [now, now]);
    await sql.run(`insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, started_at_ms, action_count, effect_count, error_count, adaptation_count, last_event_sequence, updated_at_ms)
      values (?, 'legacy.runtime', 1, 'succeeded', 'legacy_import', ?, ?, 0, 0, 0, 0, 0, ?) on conflict(run_id) do nothing`, [streamId, now, now, now]);
    return;
  }
  await sql.run(`insert into recordings (recording_id, name, status, started_at_ms, event_count, action_count, state_snapshot_count, updated_at_ms)
    values (?, ?, 'completed', ?, 0, 0, 0, ?) on conflict(recording_id) do nothing`, [streamId, streamId, now, now]);
}

function legacyFlowArtifact(value: Partial<AutomationStudioFlowArtifact>, projectId: string, fallbackFlowId: string): AutomationStudioFlowArtifact {
  const now = typeof value.updatedAt === "number" ? value.updatedAt : Date.now();
  return {
    schemaVersion: "0.1",
    flowId: typeof value.flowId === "string" && value.flowId ? value.flowId : requiredId(fallbackFlowId, "Flow"),
    projectId,
    name: typeof value.name === "string" && value.name ? value.name : fallbackFlowId,
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    scope: value.scope ?? { kind: "global" },
    visibility: value.visibility ?? "private",
    origin: "imported",
    source: value.source ?? { mode: "visual" },
    interface: value.interface ?? { inputs: [], outputs: [] },
    errors: value.errors ?? [],
    variables: value.variables ?? [],
    regions: value.regions ?? [],
    regionHandoffs: value.regionHandoffs ?? [],
    nodes: value.nodes ?? [],
    edges: value.edges ?? [],
    publication: value.publication ?? { status: "draft" },
    createdAt: typeof value.createdAt === "number" ? value.createdAt : now,
    updatedAt: now,
    metadata: value.metadata ?? {}
  };
}

function parseJsonlEvents(content: string): AutomationStudioChunkEvent[] {
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const sequence = typeof parsed.sequence === "number" ? Math.trunc(parsed.sequence) : index + 1;
    return { ...parsed, sequence: sequence > 0 ? sequence : index + 1 };
  }).sort((left, right) => left.sequence - right.sequence).map((event, index) => ({ ...event, sequence: index + 1 }));
}

function eventTimestamp(event: AutomationStudioChunkEvent | undefined): number | null {
  const value = event?.timestampMs ?? event?.timeMs ?? event?.timestamp;
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function legacyStreamId(relativePath: string, streamKind: AutomationStudioEventStreamKind): string {
  const parts = relativePath.replaceAll(path.sep, "/").split("/");
  const anchor = streamKind === "runtime" ? "runtime" : "recordings";
  const index = parts.findIndex((part) => part.toLowerCase() === anchor);
  return requiredId(index >= 0 && parts[index + 1] ? parts[index + 1]! : `${streamKind}.${digest(relativePath).slice(7, 15)}`, `${streamKind} stream`);
}


type ManifestRow = { manifest_id: string; manifest_kind: AutomationStudioMigrationManifestKind; project_id: string; digest: string; file_count: number; total_bytes: number; payload_json: string; created_at_ms: number; verified_at_ms: number | null };
type ImportProgressRow = { resource_kind: AutomationStudioLegacyResourceKind; resource_id: string; cursor_json: string; status: AutomationStudioLegacyImportProgress["status"]; imported_count: number; skipped_count: number; error_json: string | null; updated_at_ms: number };
type CutoverStateRow = { feature_name: string; state: AutomationStudioV2CutoverState; default_enabled: number; previous_state_json: string | null; reason: string; updated_at_ms: number };

async function collectLegacyFiles(rootDir: string, projectId: string, maxFiles: number): Promise<string[]> {
  const roots = [path.join("projects", "index.json"), path.join("projects", projectId)];
  const files: string[] = [];
  for (const relativeRoot of roots) {
    const absolute = path.join(rootDir, relativeRoot);
    const stats = await stat(absolute).catch(() => null);
    if (!stats) continue;
    if (stats.isFile()) files.push(relativeRoot);
    else await collectRecursive(rootDir, relativeRoot, files, maxFiles);
  }
  return files.slice(0, maxFiles).sort((left, right) => left.localeCompare(right));
}

async function collectRecursive(rootDir: string, relativeDir: string, files: string[], maxFiles: number): Promise<void> {
  if (files.length >= maxFiles) return;
  const entries = await readdir(path.join(rootDir, relativeDir), { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (files.length >= maxFiles) break;
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) await collectRecursive(rootDir, relativePath, files, maxFiles);
    else if (entry.isFile() && !relativePath.replaceAll(path.sep, "/").includes("/backups/")) files.push(relativePath);
  }
}

function classifyLegacyResource(relativePath: string): AutomationStudioLegacyResourceKind {
  const normalized = relativePath.replaceAll(path.sep, "/").toLowerCase();
  if (normalized === "projects/index.json") return "project_catalog";
  if (normalized.endsWith("indexes/objects.json")) return "object_index";
  if (normalized.includes("state-index") || normalized.endsWith("state-index.json")) return "state_index";
  if (normalized.includes("hierarchy") || normalized.includes("workspace-prefs")) return "project_hierarchy";
  if (normalized.includes("router") || normalized.includes("route")) return "router_maps";
  if (normalized.includes("publication")) return "publications";
  if (normalized.includes("instruction")) return "instructions";
  if (normalized.includes("adaptation") || normalized.includes("proposal")) return "adaptations";
  if (normalized.includes("subflow")) return "subflows";
  if (normalized.includes("recording") && (normalized.endsWith(".jsonl") || normalized.includes("timeline") || normalized.includes("events"))) return "recording_events";
  if (normalized.includes("recording")) return "recordings";
  if ((normalized.includes("runtime") || normalized.includes("run")) && (normalized.endsWith(".jsonl") || normalized.includes("events"))) return "runtime_events";
  if (normalized.includes("runtime") || normalized.includes("run")) return "runtime_runs";
  if (normalized.includes("settings") || normalized.includes("config")) return "settings";
  if (normalized.includes("flow") || normalized.endsWith("flow.json")) return "flow_documents";
  return "settings";
}

function legacyResourceId(kind: AutomationStudioLegacyResourceKind, relativePath: string): string {
  return `${kind}:${digest(relativePath).slice(7, 23)}`;
}

function migrationOperationKind(kind: AutomationStudioLegacyResourceKind, relativePath: string): AutomationStudioLegacyMigrationOperationKind {
  if (kind === "project_catalog") return "catalog_import";
  if (kind === "project_hierarchy") return "hierarchy_import";
  if (kind === "flow_documents" || relativePath.toLowerCase().endsWith("flow.json")) return "graph_split";
  if (kind === "runtime_events") return "runtime_stream_chunk";
  if (kind === "recording_events") return "recording_stream_chunk";
  if (kind === "object_index") return "object_reference";
  return "resource_import";
}

function operationRank(kind: AutomationStudioLegacyMigrationOperationKind): number {
  return { catalog_import: 0, hierarchy_import: 1, object_reference: 2, graph_split: 3, runtime_stream_chunk: 4, recording_stream_chunk: 5, resource_import: 6 }[kind];
}

async function referenceVerification(sql: AutomationStudioSqlExecutor): Promise<Array<{ code: string; count: number }>> {
  return [
    { code: "object_references.missing_object", count: await scalarCount(sql, "select count(*) as count from object_references left join objects on objects.object_id = object_references.object_id where objects.object_id is null") },
    { code: "runtime_chunks.missing_object", count: await scalarCount(sql, "select count(*) as count from runtime_event_chunks left join objects on objects.object_id = runtime_event_chunks.object_id where objects.object_id is null") },
    { code: "recording_chunks.missing_object", count: await scalarCount(sql, "select count(*) as count from recording_event_chunks left join objects on objects.object_id = recording_event_chunks.object_id where objects.object_id is null") },
    { code: "graph_edges.missing_node", count: await scalarCount(sql, "select count(*) as count from graph_edges left join graph_nodes source on source.node_id = graph_edges.source_node_id left join graph_nodes target on target.node_id = graph_edges.target_node_id where graph_edges.deleted_at_ms is null and (source.node_id is null or target.node_id is null)") }
  ];
}

async function semanticVerification(sql: AutomationStudioSqlExecutor): Promise<Array<{ code: string; detail: string }>> {
  const issues: Array<{ code: string; detail: string }> = [];
  for (const table of ["runtime_event_chunks", "recording_event_chunks"] as const) {
    const idColumn = table === "runtime_event_chunks" ? "run_id" : "recording_id";
    const overlaps = await scalarCount(sql, `select count(*) as count from ${table} a join ${table} b on a.${idColumn} = b.${idColumn} and a.chunk_id < b.chunk_id and a.last_sequence >= b.first_sequence and a.archived_at_ms is null and b.archived_at_ms is null`);
    if (overlaps) issues.push({ code: `${table}.overlapping_sequences`, detail: `${overlaps} overlapping chunk pairs` });
  }
  const duplicateFlowNames = await scalarCount(sql, "select count(*) as count from (select parent_flow_id, lower(name) name_key, count(*) duplicates from flows where deleted_at_ms is null group by parent_flow_id, name_key having duplicates > 1)");
  if (duplicateFlowNames) issues.push({ code: "flows.duplicate_sibling_names", detail: `${duplicateFlowNames} duplicate sibling Flow name groups` });
  return issues;
}

function legacyCountMismatches(inventory: AutomationStudioLegacyInventoryManifest, counts: Record<string, number>): Array<{ resourceKind: AutomationStudioLegacyResourceKind; legacyCount: number; v2Count: number }> {
  const mapping: Partial<Record<AutomationStudioLegacyResourceKind, string>> = { flow_documents: "flows", subflows: "subflows", instructions: "instructions", adaptations: "adaptations", runtime_runs: "runtime_runs", recordings: "recordings", object_index: "objects" };
  const mismatches: Array<{ resourceKind: AutomationStudioLegacyResourceKind; legacyCount: number; v2Count: number }> = [];
  for (const [resourceKind, table] of Object.entries(mapping) as Array<[AutomationStudioLegacyResourceKind, string]>) {
    const legacyCount = inventory.resourceCounts[resourceKind] ?? 0;
    const v2Count = counts[table] ?? 0;
    if (legacyCount > 0 && v2Count < legacyCount) mismatches.push({ resourceKind, legacyCount, v2Count });
  }
  return mismatches;
}

async function tableCount(sql: AutomationStudioSqlExecutor, table: string): Promise<number> {
  return scalarCount(sql, `select count(*) as count from ${table}`);
}

async function scalarCount(sql: AutomationStudioSqlExecutor, query: string): Promise<number> {
  const row = await sql.get<{ count: number }>(query).catch(() => ({ count: 0 }));
  return Math.max(0, Math.trunc(row?.count ?? 0));
}

async function mutationCounters(sql: AutomationStudioSqlExecutor): Promise<{ changeFeed: number; migrationJobs: number; mutationRecords: number }> {
  return {
    changeFeed: await scalarCount(sql, "select count(*) as count from change_feed"),
    migrationJobs: await scalarCount(sql, "select count(*) as count from migration_jobs"),
    mutationRecords: await scalarCount(sql, "select count(*) as count from mutation_records")
  };
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function emptyResourceCounts(): Record<AutomationStudioLegacyResourceKind, number> {
  return Object.fromEntries(AUTOMATION_STUDIO_LEGACY_RESOURCE_KINDS.map((kind) => [kind, 0])) as Record<AutomationStudioLegacyResourceKind, number>;
}

function countResources(resources: AutomationStudioLegacyResourceInventoryItem[]): Record<AutomationStudioLegacyResourceKind, number> {
  const counts = emptyResourceCounts();
  for (const resource of resources) counts[resource.resourceKind] += 1;
  return counts;
}

function compareInventoryItems(left: AutomationStudioLegacyResourceInventoryItem, right: AutomationStudioLegacyResourceInventoryItem): number {
  return left.resourceKind.localeCompare(right.resourceKind) || left.relativePath.localeCompare(right.relativePath);
}

function manifestFromRow(row: ManifestRow): AutomationStudioMigrationManifestRecord {
  return { manifestId: row.manifest_id, manifestKind: row.manifest_kind, projectId: row.project_id, digest: row.digest, fileCount: row.file_count, totalBytes: row.total_bytes, payload: objectJson(row.payload_json), createdAt: row.created_at_ms, verifiedAt: row.verified_at_ms };
}

function importProgressFromRow(row: ImportProgressRow): AutomationStudioLegacyImportProgress {
  return { resourceKind: row.resource_kind, resourceId: row.resource_id, cursor: objectJson(row.cursor_json), status: row.status, importedCount: row.imported_count, skippedCount: row.skipped_count, error: row.error_json, updatedAt: row.updated_at_ms };
}

function cutoverStateFromRow(row: CutoverStateRow): AutomationStudioV2FeatureState {
  return { featureName: row.feature_name, state: row.state, defaultEnabled: row.default_enabled === 1, previousState: row.previous_state_json ? objectJson(row.previous_state_json) : null, reason: row.reason, updatedAt: row.updated_at_ms };
}

function objectJson(value: string): JsonObject {
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : {};
}

function digest(value: unknown): string { return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`; }
function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
function required<T>(value: T | null | undefined, message: string): T { if (value === null || value === undefined) throw new Error(message); return value; }
function requiredId(value: string, label: string): string { const id = value.trim(); if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${label} ID.`); return id; }
function requiredKind(value: string, label: string): string { const kind = value.trim(); if (!kind || kind.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(kind)) throw new Error(`Invalid ${label}.`); return kind; }
function requiredDigest(value: string): string { const digestValue = value.trim(); if (!/^sha256:[a-f0-9]{64}$/.test(digestValue)) throw new Error("Invalid migration manifest digest."); return digestValue; }
function requiredRelativePath(value: string): string { const normalized = value.trim().replaceAll(String.fromCharCode(92), "/"); if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized.includes(String.fromCharCode(0))) throw new Error("Invalid migration relative path."); return normalized; }
function requiredResourceKind(value: AutomationStudioLegacyResourceKind): AutomationStudioLegacyResourceKind { if (!AUTOMATION_STUDIO_LEGACY_RESOURCE_KINDS.includes(value)) throw new Error("Invalid legacy resource kind."); return value; }
function nonNegative(value: number, label: string): number { const normalized = Math.trunc(value); if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${label} must be non-negative.`); return normalized; }
function clampLimit(value: number | undefined): number { return Math.max(1, Math.min(500, Math.trunc(value ?? 100))); }
function numberFromJson(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
