import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const FLUXIQ_STORAGE_LAYOUT_VERSION = 2 as const;

export type FluxIQStorageConfig = {
  version: 2;
  layoutVersion: 2;
  createdBy: "fluxiq";
  createdAt: number;
};

export type FluxIQStorageInspection = {
  layout: "fresh" | "v1" | "v2" | "migration_incomplete";
  layoutVersion: 1 | 2 | null;
  fluxiqRoot: string;
  configPath: string;
  migrationJournalPath: string;
  legacyRoots: string[];
  externalOverrides: string[];
  migrationRequired: boolean;
};

export type FluxIQMigrationJournal = {
  version: 1;
  migrationId: string;
  fromLayout: 1;
  toLayout: 2;
  stage: "inventory" | "staging" | "verified" | "archived" | "complete";
  startedAt: number;
  updatedAt: number;
  legacyRoots: string[];
  archiveRoot?: string;
};

const LEGACY_ROOT_NAMES = ["config", "data", "databases", "inputs", "outputs", "streams", "domains", "recordings", "policies"];

export function readStorageConfig(fluxiqRoot: string): FluxIQStorageConfig | null {
  try {
    const value = JSON.parse(readFileSync(path.join(fluxiqRoot, "config.json"), "utf8")) as Partial<FluxIQStorageConfig>;
    return value.layoutVersion === 2 && value.version === 2 ? value as FluxIQStorageConfig : null;
  } catch {
    return null;
  }
}

export function inspectFluxIQStorage(input: { fluxiqRoot: string; activeDomainId?: string | null; externalOverrides?: string[] }): FluxIQStorageInspection {
  const fluxiqRoot = path.resolve(input.fluxiqRoot);
  const configPath = path.join(fluxiqRoot, "config.json");
  const migrationJournalPath = path.join(fluxiqRoot, ".migration", "v2", "journal.json");
  const legacyRoots = LEGACY_ROOT_NAMES.map((name) => path.join(fluxiqRoot, name)).filter(existsSync);
  if (input.activeDomainId) {
    const scopedRoot = path.join(fluxiqRoot, input.activeDomainId);
    if (existsSync(scopedRoot)) legacyRoots.push(scopedRoot);
  }
  const config = readStorageConfig(fluxiqRoot);
  const journalExists = existsSync(migrationJournalPath);
  const anyState = existsSync(fluxiqRoot) && (legacyRoots.length > 0 || directoryHasEntries(fluxiqRoot));
  const layout = journalExists ? "migration_incomplete" : config ? "v2" : anyState ? "v1" : "fresh";
  return {
    layout,
    layoutVersion: config ? 2 : layout === "v1" || layout === "migration_incomplete" ? 1 : null,
    fluxiqRoot,
    configPath,
    migrationJournalPath,
    legacyRoots: [...new Set(legacyRoots.map((value) => path.resolve(value)))],
    externalOverrides: input.externalOverrides ?? [],
    migrationRequired: layout === "v1" || layout === "migration_incomplete"
  };
}

export async function initializeFluxIQStorage(fluxiqRoot: string): Promise<string> {
  const root = path.resolve(fluxiqRoot);
  await mkdir(root, { recursive: true });
  const configPath = path.join(root, "config.json");
  if (!existsSync(configPath)) {
    await atomicWriteJson(configPath, {
      version: 2,
      layoutVersion: 2,
      createdBy: "fluxiq",
      createdAt: Date.now()
    } satisfies FluxIQStorageConfig);
  }
  return configPath;
}

export async function readMigrationJournal(journalPath: string): Promise<FluxIQMigrationJournal | null> {
  try {
    return JSON.parse(await readFile(journalPath, "utf8")) as FluxIQMigrationJournal;
  } catch {
    return null;
  }
}

export async function writeMigrationJournal(journalPath: string, journal: FluxIQMigrationJournal): Promise<void> {
  await atomicWriteJson(journalPath, journal);
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export async function pathSize(target: string): Promise<{ files: number; bytes: number }> {
  try {
    const info = await stat(target);
    if (info.isFile()) return { files: 1, bytes: info.size };
    if (!info.isDirectory()) return { files: 0, bytes: 0 };
    let files = 0;
    let bytes = 0;
    for (const entry of await readdir(target, { withFileTypes: true })) {
      const child = await pathSize(path.join(target, entry.name));
      files += child.files;
      bytes += child.bytes;
    }
    return { files, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}

function directoryHasEntries(directory: string): boolean {
  try {
    return readdirSync(directory).some((name) => name !== ".migration");
  } catch {
    return false;
  }
}
