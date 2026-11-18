import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { acquireMigrationLock } from "./migration-lock.ts";
import {
  atomicWriteJson,
  initializeFluxIQStorage,
  inspectFluxIQStorage,
  pathSize,
  readMigrationJournal,
  writeMigrationJournal,
  type FluxIQMigrationJournal,
  type FluxIQStorageInspection
} from "./storage-layout.ts";

export type FluxIQStorageMigrationResult = {
  migrationId: string;
  configPath: string;
  archiveRoot: string;
  sourceFiles: number;
  sourceBytes: number;
  importedProgramDocuments: number;
  mergedDatabases: number;
};

/** What staging builds and the cutover moves into the root. */
const PROMOTED_ENTRIES = ["global.sqlite", "artifacts", "domains"] as const;
const PROMOTED_DIRECTORIES = ["artifacts", "domains"] as const;

export async function rollbackFluxIQStorageMigration(fluxiqRoot: string): Promise<{ rolledBack: boolean; restoredRoots: string[] }> {
  const root = path.resolve(fluxiqRoot);
  const journalPath = path.join(root, ".migration", "v2", "journal.json");
  const journal = await readMigrationJournal(journalPath);
  if (!journal) return { rolledBack: false, restoredRoots: [] };
  if (await exists(path.join(root, "config.json"))) {
    throw new Error("Storage layout v2 is already committed; automatic rollback is only available before the config.json commit marker.");
  }
  const restoredRoots: string[] = [];
  // Only a cutover (stage "archived") puts anything in the root, and it removes only what it put there: a v1 root that ran keeps its own runtime store under artifacts/ (t932).
  if (journal.stage === "archived") {
    for (const promoted of journal.promoted ?? earlierPromotedPaths(root)) await rm(promoted, { recursive: true, force: true });
    for (const entry of PROMOTED_DIRECTORIES) await removeIfEmptyDirectory(path.join(root, entry));
  }
  // The archive is named before any root moves into it, so roots archived by a migration stopped part way through are restored too.
  const archiveRoot = journal.archiveRoot ?? migrationArchiveRoot(root, journal);
  for (const original of journal.legacyRoots) {
    const archived = path.join(archiveRoot, path.relative(root, original));
    if (!await exists(archived)) continue;
    if (await exists(original)) throw new Error(`Cannot roll back over an existing path: ${original}`);
    await mkdir(path.dirname(original), { recursive: true });
    await rename(archived, original);
    restoredRoots.push(original);
  }
  await removeIfEmptyDirectory(archiveRoot);
  await removeIfEmptyDirectory(path.dirname(archiveRoot));
  await rm(path.join(root, ".migration"), { recursive: true, force: true });
  return { rolledBack: true, restoredRoots };
}

export async function migrateFluxIQStorage(input: { fluxiqRoot: string; activeDomainId?: string | null; externalOverrides?: string[] }): Promise<FluxIQStorageMigrationResult> {
  const fluxiqRoot = assertMigratable(inspectFluxIQStorage(input)).fluxiqRoot;
  const lockPath = path.join(fluxiqRoot, "migration.lock");
  await mkdir(fluxiqRoot, { recursive: true });
  if (!await acquireMigrationLock(lockPath)) throw new Error(`FluxIQ storage migration is already locked: ${lockPath}`);
  try {
    // Judged again once the lock is held: a migration another process finished meanwhile is never run a second time over its result.
    return await runMigration(assertMigratable(inspectFluxIQStorage(input)), input.activeDomainId ?? null);
  } finally {
    await rm(lockPath, { force: true });
  }
}

function assertMigratable(inspection: FluxIQStorageInspection): FluxIQStorageInspection {
  if (inspection.layout === "v2") throw new Error("FluxIQ storage already uses layout v2.");
  if (inspection.layout === "fresh") throw new Error("Fresh FluxIQ storage should be initialized with setup(), not migrated.");
  if (inspection.layout === "uncommitted_v2") throw new Error("Uncommitted FluxIQ layout v2 must use adoptUncommittedFluxIQStorage(), not migrateStorage().");
  if (inspection.externalOverrides.length) throw new Error(`Automatic migration does not move external storage overrides: ${inspection.externalOverrides.join(", ")}`);
  return inspection;
}

async function runMigration(inspection: FluxIQStorageInspection, activeDomainId: string | null): Promise<FluxIQStorageMigrationResult> {
  const journalPath = inspection.migrationJournalPath;
  const existing = await readMigrationJournal(journalPath);
  const now = Date.now();
  const journal: FluxIQMigrationJournal = existing ?? {
    version: 1,
    migrationId: randomUUID(),
    fromLayout: 1,
    toLayout: 2,
    stage: "inventory",
    startedAt: now,
    updatedAt: now,
    legacyRoots: inspection.legacyRoots
  };
  await writeMigrationJournal(journalPath, journal);
  const stagingRoot = path.join(inspection.fluxiqRoot, ".migration", "v2", "staged");
  const stagedDatabase = path.join(stagingRoot, "global.sqlite");
  let importedProgramDocuments = 0;
  let mergedDatabases = 0;

  if (journal.stage === "inventory" || journal.stage === "staging") {
    journal.stage = "staging";
    journal.updatedAt = Date.now();
    await writeMigrationJournal(journalPath, journal);
    await rm(stagingRoot, { recursive: true, force: true });
    await mkdir(stagingRoot, { recursive: true });
    const globalDatabases = globalDatabaseSources(inspection.fluxiqRoot, activeDomainId);
    for (const source of globalDatabases) {
      if (await isFile(source)) {
        await mergeSQLiteDatabase(source, stagedDatabase);
        mergedDatabases += 1;
      }
    }
    for (const dataRoot of legacyDataRoots(inspection.fluxiqRoot, activeDomainId)) {
      importedProgramDocuments += await importProgramJson(dataRoot, stagedDatabase);
      const automationRoot = path.join(dataRoot, "programs", "automation-studio");
      if (await isDirectory(automationRoot)) {
        const stagedAutomationRoot = path.join(stagingRoot, "artifacts", "automation-studio");
        await mergeTree(automationRoot, stagedAutomationRoot);
        await migrateLegacyAutomationProjects(automationRoot, stagedAutomationRoot);
        importedProgramDocuments += await importAutomationJson(stagedAutomationRoot, stagedDatabase);
        await removeEmptyDirectories(stagedAutomationRoot);
      }
    }
    await stageDomainDatabases(inspection.fluxiqRoot, activeDomainId, stagingRoot);
    journal.stage = "verified";
    journal.updatedAt = Date.now();
    await writeMigrationJournal(journalPath, journal);
  }

  const sourceTotals = await totalSize(journal.legacyRoots);
  const archiveRoot = journal.archiveRoot ?? migrationArchiveRoot(inspection.fluxiqRoot, journal);
  if (journal.stage === "verified") {
    // Nothing moves while the cutover would meet state already in one of its places; the root stays as it was, to resume once that path is cleared or to roll back.
    const promoted = await promotionTargets(stagingRoot, inspection.fluxiqRoot);
    const collisions = await promotionCollisions(inspection.fluxiqRoot, promoted, journal.legacyRoots);
    if (collisions.length) throw new Error(`FluxIQ storage migration stopped before moving anything: layout v2 state already exists at ${collisions.join(", ")}.`);
    journal.archiveRoot = archiveRoot;
    journal.promoted = promoted;
    journal.updatedAt = Date.now();
    await writeMigrationJournal(journalPath, journal);
    await mkdir(archiveRoot, { recursive: true });
    for (const source of journal.legacyRoots) {
      if (!await exists(source)) continue;
      const relative = path.relative(inspection.fluxiqRoot, source);
      const destination = path.join(archiveRoot, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(source, destination);
    }
    journal.stage = "archived";
    journal.updatedAt = Date.now();
    await writeMigrationJournal(journalPath, journal);
  }

  if (journal.stage === "archived") {
    for (const entry of PROMOTED_ENTRIES) await promoteStagedEntry(path.join(stagingRoot, entry), path.join(inspection.fluxiqRoot, entry));
    const configPath = await initializeFluxIQStorage(inspection.fluxiqRoot);
    journal.stage = "complete";
    journal.updatedAt = Date.now();
    await atomicWriteJson(path.join(inspection.fluxiqRoot, "migration-history.json"), { migrations: [{ ...journal, archiveRoot }] });
    await rm(path.join(inspection.fluxiqRoot, ".migration"), { recursive: true, force: true });
    return { migrationId: journal.migrationId, configPath, archiveRoot, sourceFiles: sourceTotals.files, sourceBytes: sourceTotals.bytes, importedProgramDocuments, mergedDatabases };
  }
  throw new Error(`Unsupported migration resume stage: ${journal.stage}`);
}

/** Where a migration archives its legacy roots: named from the journal alone, so a resumed migration and a rollback find the same place. */
function migrationArchiveRoot(fluxiqRoot: string, journal: FluxIQMigrationJournal): string {
  return path.join(fluxiqRoot, "legacy", `v1-${journal.startedAt}`);
}

/**
 * The places the cutover fills: a staged file's own place, and for a staged
 * directory each of its children inside the root's directory of that name,
 * which a v1 root that ran already holds (its runtime store is
 * `artifacts/runtime`, outside every legacy root).
 */
async function promotionTargets(stagingRoot: string, fluxiqRoot: string): Promise<string[]> {
  const targets: string[] = [];
  for (const entry of PROMOTED_ENTRIES) {
    const source = path.join(stagingRoot, entry);
    if (await isDirectory(source)) targets.push(...(await readdir(source)).map((child) => path.join(fluxiqRoot, entry, child)));
    else if (await exists(source)) targets.push(path.join(fluxiqRoot, entry));
  }
  return targets;
}

/** The targets already taken, and any promoted directory the root holds as something else. A place inside a legacy root is free by the cutover, because that root is archived first. */
async function promotionCollisions(fluxiqRoot: string, targets: string[], legacyRoots: string[]): Promise<string[]> {
  const archived = legacyRoots.map((root) => path.resolve(root));
  const archivedFirst = (target: string) => archived.some((root) => target === root || target.startsWith(`${root}${path.sep}`));
  const collisions: string[] = [];
  for (const entry of PROMOTED_DIRECTORIES) {
    const directory = path.join(fluxiqRoot, entry);
    if (!archivedFirst(directory) && await exists(directory) && !await isDirectory(directory)) collisions.push(directory);
  }
  for (const target of targets) {
    if (!archivedFirst(target) && await exists(target)) collisions.push(target);
  }
  return collisions;
}

/** Moves one staged entry into the root, a directory child by child so the root's own children stay; a resumed cutover moves only what is left. */
async function promoteStagedEntry(source: string, destination: string): Promise<void> {
  if (!await exists(source)) return;
  if (!await isDirectory(source)) {
    if (await exists(destination)) throw new Error(`Migration source and target both exist during cutover: ${destination}`);
    await rename(source, destination);
    return;
  }
  await mkdir(destination, { recursive: true });
  for (const child of await readdir(source)) {
    const target = path.join(destination, child);
    if (await exists(target)) throw new Error(`Migration source and target both exist during cutover: ${target}`);
    await rename(path.join(source, child), target);
  }
  await rmdir(source);
}

/**
 * What a cutover journaled before `promoted` existed could have put in the
 * root: it renamed whole entries, and only into places that were free, so a
 * root's own `artifacts/` (its runtime store) was never one of them.
 */
function earlierPromotedPaths(fluxiqRoot: string): string[] {
  return [path.join(fluxiqRoot, "global.sqlite"), path.join(fluxiqRoot, "domains"), path.join(fluxiqRoot, "artifacts", "automation-studio")];
}

async function removeIfEmptyDirectory(directory: string): Promise<void> {
  if (await isDirectory(directory) && (await readdir(directory)).length === 0) await rmdir(directory);
}

async function migrateLegacyAutomationProjects(sourceRoot: string, targetRoot: string): Promise<void> {
  const legacyPath = path.join(sourceRoot, "projects.json");
  if (!await isFile(legacyPath)) return;
  const payload = JSON.parse(await readFile(legacyPath, "utf8")) as { data?: { categories?: Array<Record<string, unknown>>; projects?: Array<Record<string, unknown>> } };
  const legacy = payload.data ?? {};
  const indexPath = path.join(targetRoot, "projects", "index.json");
  const currentPayload: { data?: { categories?: Array<Record<string, unknown>>; projects?: Array<Record<string, unknown>> } } = await readFile(indexPath, "utf8").then(
    (value) => JSON.parse(value) as { data?: { categories?: Array<Record<string, unknown>>; projects?: Array<Record<string, unknown>> } },
    () => ({ data: {} })
  );
  const current = currentPayload.data ?? {};
  const categories = mergeRecordsById(current.categories ?? [], legacy.categories ?? [], "Automation Studio category");
  const projects = mergeRecordsById(
    current.projects ?? [],
    (legacy.projects ?? []).map(({ customHierarchyNodes: _nodes, deletedHierarchyIds: _deleted, workspacePrefs: _workspace, ...project }) => project),
    "Automation Studio project"
  );
  await atomicWriteJson(indexPath, { version: 1, data: { categories, projects } });
  for (const project of legacy.projects ?? []) {
    const id = typeof project.id === "string" ? project.id : "";
    if (!id) continue;
    const projectRoot = path.join(targetRoot, "projects", safeSegment(id));
    const { customHierarchyNodes = [], deletedHierarchyIds = [], workspacePrefs = {}, ...manifest } = project;
    await writeCompatibleDocument(path.join(projectRoot, "manifest.json"), manifest, `Automation Studio project ${id}`);
    await writeCompatibleDocument(path.join(projectRoot, "hierarchy", "nodes.json"), { customHierarchyNodes }, `Automation Studio hierarchy ${id}`);
    await writeCompatibleDocument(path.join(projectRoot, "hierarchy", "deleted.json"), { deletedHierarchyIds }, `Automation Studio deleted hierarchy ${id}`);
    await writeCompatibleDocument(path.join(projectRoot, "workspace", "preferences.json"), { workspacePrefs }, `Automation Studio workspace ${id}`);
  }
}

async function writeCompatibleDocument(filePath: string, data: Record<string, unknown>, label: string): Promise<void> {
  if (await isFile(filePath)) {
    const current = JSON.parse(await readFile(filePath, "utf8")) as { data?: unknown };
    if (JSON.stringify(current.data ?? current) !== JSON.stringify(data)) throw new Error(`Divergent ${label} collision.`);
    return;
  }
  await atomicWriteJson(filePath, { version: 1, data });
}

function mergeRecordsById(current: Array<Record<string, unknown>>, incoming: Array<Record<string, unknown>>, label: string): Array<Record<string, unknown>> {
  const records = new Map(current.map((record) => [String(record.id ?? ""), record]));
  for (const record of incoming) {
    const id = String(record.id ?? "");
    if (!id) continue;
    const existing = records.get(id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) throw new Error(`Divergent ${label} collision: ${id}`);
    records.set(id, record);
  }
  return [...records.values()];
}

function safeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

async function importProgramJson(dataRoot: string, databasePath: string): Promise<number> {
  const programsRoot = path.join(dataRoot, "programs");
  if (!await isDirectory(programsRoot)) return 0;
  const files = await jsonFiles(programsRoot);
  const db = await openDatabase(databasePath);
  try {
    await run(db, 'create table if not exists "program.state" (id text primary key, kind text not null, data text not null, created_at_ms integer not null, updated_at_ms integer not null)');
    let imported = 0;
    for (const file of files) {
      const relative = path.relative(programsRoot, file).replaceAll("\\", "/");
      if (relative.startsWith("automation-studio/")) continue;
      const parsed = JSON.parse(await readFile(file, "utf8")) as { data?: unknown };
      const data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
      const id = relative.replace(/\.json$/i, "");
      const existing = await get<{ data: string }>(db, 'select data from "program.state" where id = ?', [id]);
      const serialized = JSON.stringify(data);
      if (existing && stableJson(existing.data) !== stableJson(serialized)) throw new Error(`Divergent program-state collision: ${id}`);
      if (!existing) {
        const timestamp = Date.now();
        await run(db, 'insert into "program.state" (id, kind, data, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?)', [id, "program.state", serialized, timestamp, timestamp]);
        imported += 1;
      }
    }
    return imported;
  } finally {
    await closeDatabase(db);
  }
}

async function importAutomationJson(automationRoot: string, databasePath: string): Promise<number> {
  if (!await isDirectory(automationRoot)) return 0;
  const files = await jsonFiles(automationRoot);
  const db = await openDatabase(databasePath);
  try {
    await run(db, 'create table if not exists "automation.state" (id text primary key, kind text not null, data text not null, created_at_ms integer not null, updated_at_ms integer not null)');
    let imported = 0;
    for (const file of files) {
      const relative = path.relative(automationRoot, file).replaceAll("\\", "/");
      if (relative === "projects.json" || relative.split("/").includes("objects")) continue;
      const parsed = JSON.parse(await readFile(file, "utf8")) as { data?: unknown };
      const data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
      const id = relative.replace(/\.json$/i, "");
      const existing = await get<{ data: string }>(db, 'select data from "automation.state" where id = ?', [id]);
      const serialized = JSON.stringify(data);
      if (existing && stableJson(existing.data) !== stableJson(serialized)) throw new Error(`Divergent Automation Studio state collision: ${id}`);
      if (!existing) {
        const timestamp = Date.now();
        await run(db, 'insert into "automation.state" (id, kind, data, created_at_ms, updated_at_ms) values (?, ?, ?, ?, ?)', [id, "automation.state", serialized, timestamp, timestamp]);
        imported += 1;
      }
      await rm(file, { force: true });
    }
    return imported;
  } finally {
    await closeDatabase(db);
  }
}

async function mergeSQLiteDatabase(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const sidecarsBefore = await Promise.all(SQLITE_SIDECARS.map((suffix) => exists(`${sourcePath}${suffix}`)));
  const source = await openDatabase(sourcePath, true);
  const target = await openDatabase(targetPath);
  try {
    const tables = await all<{ name: string; sql: string }>(source, "select name, sql from sqlite_master where type = 'table' and name not like 'sqlite_%'");
    for (const table of tables) {
      // SQLite stores a table's CREATE text without IF NOT EXISTS, so a table an earlier source already staged is not created again (a v1 root's unscoped and domain-scoped databases share their tables).
      if (!await get(target, "select 1 from sqlite_master where type = 'table' and name = ?", [table.name])) await run(target, table.sql);
      const columns = await all<{ name: string }>(source, `pragma table_info(${quoteIdentifier(table.name)})`);
      const names = columns.map((column) => column.name);
      const rows = await all<Record<string, unknown>>(source, `select * from ${quoteIdentifier(table.name)}`);
      for (const row of rows) {
        const placeholders = names.map(() => "?").join(", ");
        const sql = `insert or ignore into ${quoteIdentifier(table.name)} (${names.map(quoteIdentifier).join(", ")}) values (${placeholders})`;
        const result = await run(target, sql, names.map((name) => row[name]));
        if (result.changes === 0 && names.includes("id")) {
          const current = await get<Record<string, unknown>>(target, `select * from ${quoteIdentifier(table.name)} where id = ?`, [row.id]);
          if (JSON.stringify(current) !== JSON.stringify(row)) throw new Error(`Divergent SQLite collision in ${table.name}: ${String(row.id)}`);
        }
      }
    }
  } finally {
    await closeDatabase(source);
    await closeDatabase(target);
    await removeReadSidecars(sourcePath, sidecarsBefore);
  }
}

const SQLITE_SIDECARS = ["-wal", "-shm"] as const;

/**
 * A read-only connection to a WAL database leaves an empty `-wal` and its
 * `-shm` beside it, which only a writer may delete. When the database had
 * neither before the read, those two are the read's own and are removed, so
 * an archived or rolled-back legacy root holds exactly the files it held.
 */
async function removeReadSidecars(databasePath: string, before: boolean[]): Promise<void> {
  if (before.some(Boolean)) return;
  const wal = `${databasePath}-wal`;
  if (await isFile(wal) && (await stat(wal)).size > 0) return;
  for (const suffix of SQLITE_SIDECARS) await rm(`${databasePath}${suffix}`, { force: true });
}

/** Layout v1 kept domain-scoped records beside each global database it used, the active domain's scoped tree included (`<domain>/databases/domains/`), so each is staged, not only archived. */
async function stageDomainDatabases(fluxiqRoot: string, activeDomainId: string | null, stagingRoot: string): Promise<void> {
  for (const globalDatabase of globalDatabaseSources(fluxiqRoot, activeDomainId)) {
    const legacyDomainRoot = path.join(path.dirname(globalDatabase), "domains");
    if (!await isDirectory(legacyDomainRoot)) continue;
    for (const entry of await readdir(legacyDomainRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".sqlite")) continue;
      const domainId = entry.name.replace(/\.sqlite$/i, "");
      await mergeSQLiteDatabase(path.join(legacyDomainRoot, entry.name), path.join(stagingRoot, "domains", domainId, "domain.sqlite"));
    }
  }
}

async function mergeTree(source: string, destination: string): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await mergeTree(from, to);
    else if (entry.isFile()) {
      await mkdir(path.dirname(to), { recursive: true });
      if (await isFile(to)) {
        if (await digest(from) !== await digest(to)) throw new Error(`Divergent artifact collision: ${to}`);
      } else await cp(from, to);
    }
  }
}

function globalDatabaseSources(root: string, domainId: string | null): string[] {
  return [path.join(root, "databases", "global.sqlite"), ...(domainId ? [path.join(root, domainId, "databases", "global.sqlite")] : [])];
}

function legacyDataRoots(root: string, domainId: string | null): string[] {
  return [path.join(root, "data"), ...(domainId ? [path.join(root, domainId, "data")] : [])];
}

async function jsonFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await jsonFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".json")) result.push(target);
  }
  return result;
}

async function removeEmptyDirectories(root: string): Promise<boolean> {
  if (!await isDirectory(root)) return false;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) await removeEmptyDirectories(path.join(root, entry.name));
  }
  if ((await readdir(root)).length > 0) return false;
  await rm(root, { recursive: true, force: true });
  return true;
}

async function totalSize(paths: string[]): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for (const target of paths) {
    const size = await pathSize(target);
    files += size.files;
    bytes += size.bytes;
  }
  return { files, bytes };
}

async function digest(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function exists(target: string): Promise<boolean> { return await stat(target).then(() => true, () => false); }
async function isFile(target: string): Promise<boolean> { return await stat(target).then((value) => value.isFile(), () => false); }
async function isDirectory(target: string): Promise<boolean> { return await stat(target).then((value) => value.isDirectory(), () => false); }
function stableJson(value: string): string { try { return JSON.stringify(JSON.parse(value)); } catch { return value; } }
function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }

function openDatabase(filePath: string, readOnly = false): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const mode = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX;
    const db = new sqlite3.Database(path.toNamespacedPath(filePath), mode, (error) => error ? reject(error) : resolve(db)); // Windows' extended form: SQLite refuses a nested root's long path otherwise (t568).
  });
}
function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<{ changes: number }> { return new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve({ changes: this.changes }); })); }
function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> { return new Promise((resolve, reject) => db.all(sql, params, (error, rows: T[]) => error ? reject(error) : resolve(rows))); }
function get<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> { return new Promise((resolve, reject) => db.get(sql, params, (error, row: T | undefined) => error ? reject(error) : resolve(row))); }
function closeDatabase(db: sqlite3.Database): Promise<void> { return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
