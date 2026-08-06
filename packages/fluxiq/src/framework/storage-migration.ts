import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sqlite3 from "sqlite3";
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

export async function rollbackFluxIQStorageMigration(fluxiqRoot: string): Promise<{ rolledBack: boolean; restoredRoots: string[] }> {
  const root = path.resolve(fluxiqRoot);
  const journalPath = path.join(root, ".migration", "v2", "journal.json");
  const journal = await readMigrationJournal(journalPath);
  if (!journal) return { rolledBack: false, restoredRoots: [] };
  if (await exists(path.join(root, "config.json"))) {
    throw new Error("Storage layout v2 is already committed; automatic rollback is only available before the config.json commit marker.");
  }
  const restoredRoots: string[] = [];
  if (journal.archiveRoot) {
    for (const promoted of ["global.sqlite", "artifacts", "domains"]) {
      await rm(path.join(root, promoted), { recursive: true, force: true });
    }
    for (const original of journal.legacyRoots) {
      const archived = path.join(journal.archiveRoot, path.relative(root, original));
      if (!await exists(archived)) continue;
      if (await exists(original)) throw new Error(`Cannot roll back over an existing path: ${original}`);
      await mkdir(path.dirname(original), { recursive: true });
      await rename(archived, original);
      restoredRoots.push(original);
    }
  }
  await rm(path.join(root, ".migration"), { recursive: true, force: true });
  return { rolledBack: true, restoredRoots };
}

export async function migrateFluxIQStorage(input: { fluxiqRoot: string; activeDomainId?: string | null; externalOverrides?: string[] }): Promise<FluxIQStorageMigrationResult> {
  const inspection = inspectFluxIQStorage(input);
  if (inspection.layout === "v2") throw new Error("FluxIQ storage already uses layout v2.");
  if (inspection.layout === "fresh") throw new Error("Fresh FluxIQ storage should be initialized with setup(), not migrated.");
  if (inspection.externalOverrides.length) throw new Error(`Automatic migration does not move external storage overrides: ${inspection.externalOverrides.join(", ")}`);

  const lockPath = path.join(inspection.fluxiqRoot, "migration.lock");
  await mkdir(inspection.fluxiqRoot, { recursive: true });
  const lock = await acquireMigrationLock(lockPath);
  if (!lock) throw new Error(`FluxIQ storage migration is already locked: ${lockPath}`);
  await lock.writeFile(JSON.stringify({ pid: process.pid, host: os.hostname(), startedAt: Date.now() }));
  await lock.close();
  try {
    return await runMigration(inspection, input.activeDomainId ?? null);
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function acquireMigrationLock(lockPath: string): Promise<Awaited<ReturnType<typeof open>> | null> {
  const initial = await open(lockPath, "wx").catch(() => null);
  if (initial) return initial;
  try {
    const current = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: unknown; host?: unknown };
    const sameHost = current.host === os.hostname();
    const pid = typeof current.pid === "number" ? current.pid : 0;
    if (!sameHost || (pid > 0 && processIsAlive(pid))) return null;
    await rm(lockPath, { force: true });
    return await open(lockPath, "wx").catch(() => null);
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
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
    await stageDomainDatabases(inspection.fluxiqRoot, stagingRoot);
    journal.stage = "verified";
    journal.updatedAt = Date.now();
    await writeMigrationJournal(journalPath, journal);
  }

  const sourceTotals = await totalSize(journal.legacyRoots);
  const archiveRoot = journal.archiveRoot ?? path.join(inspection.fluxiqRoot, "legacy", `v1-${journal.startedAt}`);
  if (journal.stage === "verified") {
    await mkdir(archiveRoot, { recursive: true });
    for (const source of journal.legacyRoots) {
      if (!await exists(source)) continue;
      const relative = path.relative(inspection.fluxiqRoot, source);
      const destination = path.join(archiveRoot, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(source, destination);
    }
    journal.archiveRoot = archiveRoot;
    journal.stage = "archived";
    journal.updatedAt = Date.now();
    await writeMigrationJournal(journalPath, journal);
  }

  if (journal.stage === "archived") {
    for (const entry of ["global.sqlite", "artifacts", "domains"] as const) {
      const source = path.join(stagingRoot, entry);
      const destination = path.join(inspection.fluxiqRoot, entry);
      const sourceExists = await exists(source);
      const destinationExists = await exists(destination);
      if (!sourceExists && destinationExists) continue;
      if (!sourceExists) continue;
      if (destinationExists) throw new Error(`Migration source and target both exist during cutover: ${destination}`);
      await rename(source, destination);
    }
    const configPath = await initializeFluxIQStorage(inspection.fluxiqRoot);
    journal.stage = "complete";
    journal.updatedAt = Date.now();
    await atomicWriteJson(path.join(inspection.fluxiqRoot, "migration-history.json"), { migrations: [{ ...journal, archiveRoot }] });
    await rm(path.join(inspection.fluxiqRoot, ".migration"), { recursive: true, force: true });
    return { migrationId: journal.migrationId, configPath, archiveRoot, sourceFiles: sourceTotals.files, sourceBytes: sourceTotals.bytes, importedProgramDocuments, mergedDatabases };
  }
  throw new Error(`Unsupported migration resume stage: ${journal.stage}`);
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
  const source = await openDatabase(sourcePath, true);
  const target = await openDatabase(targetPath);
  try {
    const tables = await all<{ name: string; sql: string }>(source, "select name, sql from sqlite_master where type = 'table' and name not like 'sqlite_%'");
    for (const table of tables) {
      await run(target, table.sql);
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
  }
}

async function stageDomainDatabases(fluxiqRoot: string, stagingRoot: string): Promise<void> {
  const legacyDomainRoot = path.join(fluxiqRoot, "databases", "domains");
  if (!await isDirectory(legacyDomainRoot)) return;
  for (const entry of await readdir(legacyDomainRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".sqlite")) continue;
    const domainId = entry.name.replace(/\.sqlite$/i, "");
    await mergeSQLiteDatabase(path.join(legacyDomainRoot, entry.name), path.join(stagingRoot, "domains", domainId, "domain.sqlite"));
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
    const db = new sqlite3.Database(filePath, mode, (error) => error ? reject(error) : resolve(db));
  });
}
function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<{ changes: number }> { return new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve({ changes: this.changes }); })); }
function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> { return new Promise((resolve, reject) => db.all(sql, params, (error, rows: T[]) => error ? reject(error) : resolve(rows))); }
function get<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> { return new Promise((resolve, reject) => db.get(sql, params, (error, row: T | undefined) => error ? reject(error) : resolve(row))); }
function closeDatabase(db: sqlite3.Database): Promise<void> { return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())); }
