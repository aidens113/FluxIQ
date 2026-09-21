import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sqlite3 from "sqlite3";
import { atomicWriteJson, FLUXIQ_STORAGE_LAYOUT_VERSION, inspectFluxIQStorage, type FluxIQStorageConfig } from "./storage-layout.ts";

const ALLOWED_DIRECTORIES = new Set(["artifacts", "cache", "logs", "security", "tmp"]);
const RECOGNIZED_GLOBAL_TABLES = new Set([
  "automation.state",
  "background.tasks",
  "compute.nodes",
  "deployment.targets",
  "identity.users",
  "production.targets",
  "program.state",
  "secret.keys"
]);

export type FluxIQUncommittedV2AdoptionResult = {
  configPath: string;
  databasePath: string;
  databaseBytes: number;
  databaseSha256: string;
  retainedEntries: string[];
};

/**
 * Explicitly commits an interrupted v2 bootstrap after validating its existing
 * state. The host must be stopped; this operation never runs during setup.
 */
export async function adoptUncommittedFluxIQStorage(input: {
  fluxiqRoot: string;
  activeDomainId?: string | null;
  externalOverrides?: string[];
}): Promise<FluxIQUncommittedV2AdoptionResult> {
  const inspection = inspectFluxIQStorage(input);
  if (inspection.layout !== "uncommitted_v2") {
    throw new Error(`Cannot adopt FluxIQ storage: expected uncommitted_v2, found ${inspection.layout}.`);
  }
  if (inspection.externalOverrides.length) {
    throw new Error(`Cannot adopt FluxIQ storage with external storage overrides: ${inspection.externalOverrides.join(", ")}`);
  }

  const before = await inspectEntries(inspection.fluxiqRoot);
  const database = before.find((entry) => entry.name === "global.sqlite");
  if (!database || database.kind !== "file") {
    throw new Error("Cannot adopt FluxIQ storage without a regular global.sqlite database.");
  }
  const databasePath = path.join(inspection.fluxiqRoot, database.name);
  const databaseBefore = await databaseIdentity(databasePath);
  await verifySQLiteDatabase(databasePath);
  const databaseAfter = await databaseIdentity(databasePath);
  if (databaseBefore.bytes !== databaseAfter.bytes || databaseBefore.sha256 !== databaseAfter.sha256) {
    throw new Error("Cannot adopt FluxIQ storage because global.sqlite changed during validation.");
  }

  const after = await inspectEntries(inspection.fluxiqRoot);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Cannot adopt FluxIQ storage because its top-level state changed during validation.");
  }

  const configPath = path.join(inspection.fluxiqRoot, "config.json");
  await atomicWriteJson(configPath, {
    version: FLUXIQ_STORAGE_LAYOUT_VERSION,
    layoutVersion: FLUXIQ_STORAGE_LAYOUT_VERSION,
    createdBy: "fluxiq",
    createdAt: Date.now()
  } satisfies FluxIQStorageConfig);
  return {
    configPath,
    databasePath,
    databaseBytes: databaseAfter.bytes,
    databaseSha256: databaseAfter.sha256,
    retainedEntries: after.map((entry) => entry.name)
  };
}

async function inspectEntries(root: string): Promise<Array<{ name: string; kind: "directory" | "file" }>> {
  const entries = await readdir(root, { withFileTypes: true });
  const inspected: Array<{ name: string; kind: "directory" | "file" }> = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) throw new Error(`Cannot adopt FluxIQ storage containing a symbolic link: ${entry.name}.`);
    const kind = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : null;
    if (!kind) throw new Error(`Cannot adopt FluxIQ storage containing an unsupported entry: ${entry.name}.`);
    const allowed = entry.name === "global.sqlite" && kind === "file"
      || ALLOWED_DIRECTORIES.has(entry.name) && kind === "directory";
    if (!allowed) throw new Error(`Cannot adopt FluxIQ storage containing an unknown or ambiguous entry: ${entry.name}.`);
    inspected.push({ name: entry.name, kind });
  }
  return inspected;
}

async function databaseIdentity(databasePath: string): Promise<{ bytes: number; sha256: string }> {
  const [info, contents] = await Promise.all([stat(databasePath), readFile(databasePath)]);
  if (!info.isFile() || info.size === 0) throw new Error("Cannot adopt an empty or non-file global.sqlite database.");
  return { bytes: info.size, sha256: createHash("sha256").update(contents).digest("hex") };
}

async function verifySQLiteDatabase(databasePath: string): Promise<void> {
  const databaseUri = `${pathToFileURL(databasePath).href}?immutable=1`;
  const database = await new Promise<sqlite3.Database>((resolve, reject) => {
    const opened = new sqlite3.Database(databaseUri, sqlite3.OPEN_READONLY | sqlite3.OPEN_URI, (error) => error ? reject(error) : resolve(opened));
  }).catch((error) => {
    throw new Error(`Cannot adopt malformed global.sqlite: ${error instanceof Error ? error.message : String(error)}`);
  });
  try {
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      database.get("pragma quick_check", (error, row: Record<string, unknown>) => error ? reject(error) : resolve(row));
    });
    if (Object.values(result)[0] !== "ok") throw new Error("SQLite quick_check did not return ok.");
    const tables = await new Promise<Array<{ name: string }>>((resolve, reject) => {
      database.all("select name from sqlite_schema where type = 'table' and name not like 'sqlite_%'", (error, rows: Array<{ name: string }>) => error ? reject(error) : resolve(rows));
    });
    if (!tables.some((table) => RECOGNIZED_GLOBAL_TABLES.has(table.name))) {
      throw new Error("global.sqlite does not contain a recognized FluxIQ global table.");
    }
  } catch (error) {
    throw new Error(`Cannot adopt malformed global.sqlite: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await new Promise<void>((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
  }
}
