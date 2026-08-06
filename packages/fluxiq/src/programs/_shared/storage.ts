import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { JsonObject, JsonValue } from "../../core/index.ts";
import type { RepositoryScope } from "../database-manager/index.ts";
import { createRecord, SQLiteRepository, type SQLiteTransaction } from "../database-manager/storage/sqlite-repository.ts";

export type JsonFileDocument<T extends JsonObject = JsonObject> = {
  version: 1;
  data: T;
};

export class ProgramStateReadError extends Error {
  readonly code = "program_state.invalid";

  constructor(
    readonly filePath: string,
    cause: unknown,
    readonly fileRecoveryAvailable: boolean,
  ) {
    super(
      fileRecoveryAvailable
        ? `Program state is malformed at ${filePath}. Call recoverMalformedState() to archive it and reset this store.`
        : `Program state is malformed at ${filePath}. Inspect and repair the owning SQLite record before retrying.`,
      { cause },
    );
    this.name = "ProgramStateReadError";
  }
}

export class ProgramJsonStore<T extends JsonObject = JsonObject> {
  private static readonly writeLocks = new Map<string, Promise<void>>();
  readonly filePath: string;

  constructor(
    filePath: string,
    private readonly empty: () => T,
  ) {
    this.filePath = path.resolve(filePath);
  }

  async read(): Promise<T> {
    const sqlite = this.sqliteState();
    if (sqlite) {
      try {
        const record = await sqlite.repository.get(sqlite.id);
        return (record?.data as T | undefined) ?? this.empty();
      } catch (error) {
        throw new ProgramStateReadError(this.filePath, error, false);
      }
    }
    try {
      const payload = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<JsonFileDocument<T>>;
      if (payload?.version === 1 && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
        return payload.data as T;
      }
      throw new Error("Expected a version 1 program-state envelope with object data.");
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return this.empty();
      if (error instanceof ProgramStateReadError) throw error;
      throw new ProgramStateReadError(this.filePath, error, true);
    }
  }

  async recoverMalformedState(nowMs = Date.now()): Promise<{ backupPath: string; data: T }> {
    if (this.sqliteState()) throw new Error("File recovery is unavailable for SQLite-backed program state; repair the owning record through Database Manager.");
    return await ProgramJsonStore.withFileLock(this.filePath, async () => {
      try {
        await this.read();
      } catch (error) {
        if (!(error instanceof ProgramStateReadError)) throw error;
        const backupPath = `${this.filePath}.corrupt.${nowMs}.${randomUUID()}.bak`;
        await rename(this.filePath, backupPath);
        const data = this.empty();
        try {
          await this.writeUnlocked(data);
        } catch (writeError) {
          await rename(backupPath, this.filePath).catch(() => undefined);
          throw writeError;
        }
        return { backupPath, data };
      }
      throw new Error(`Program state is valid and does not require recovery: ${this.filePath}`);
    });
  }

  async write(data: T): Promise<T> {
    return await ProgramJsonStore.withFileLock(this.filePath, async () => this.writeUnlocked(data));
  }

  async update(mutator: (data: T) => T | void | Promise<T | void>): Promise<T> {
    return await ProgramJsonStore.withFileLock(this.filePath, async () => {
      const data = await this.read();
      const result = await mutator(data);
      return this.writeUnlocked(result ?? data);
    });
  }

  static async listDirectoryDocuments<TDocument extends JsonObject>(directoryPath: string, documentFileName: string): Promise<TDocument[] | null> {
    const sqlite = sqliteStateForPath(directoryPath);
    if (!sqlite) return null;
    const suffix = `/${documentFileName.replace(/\.json$/i, "")}`;
    const prefix = `${sqlite.id.replace(/\/$/, "")}/`;
    const records = await sqlite.repository.list();
    return records
      .filter((record) => record.id.startsWith(prefix) && record.id.endsWith(suffix))
      .filter((record) => !record.id.slice(prefix.length, -suffix.length).includes("/"))
      .map((record) => structuredClone(record.data) as TDocument);
  }

  static async deletePath(targetPath: string): Promise<boolean> {
    const sqlite = sqliteStateForPath(targetPath);
    if (!sqlite) return false;
    const isDocument = path.extname(targetPath).toLowerCase() === ".json";
    if (isDocument) return await sqlite.repository.delete(sqlite.id);
    const prefix = `${sqlite.id.replace(/\/$/, "")}/`;
    const records = await sqlite.repository.list();
    let deleted = false;
    for (const record of records) {
      if (record.id === sqlite.id || record.id.startsWith(prefix)) deleted = (await sqlite.repository.delete(record.id)) || deleted;
    }
    return deleted;
  }

  static async transaction<TResult>(anchorPath: string, operation: (transaction: ProgramDocumentTransaction) => Promise<TResult>): Promise<TResult> {
    const anchor = sqliteStateForPath(anchorPath);
    if (!anchor) throw new Error(`Program document transactions require FluxIQ storage layout v2: ${anchorPath}`);
    return await anchor.repository.transaction({}, async (sqlite) => operation(new ProgramDocumentTransaction(anchor.rootDir, anchor.kind, sqlite)));
  }

  private async writeUnlocked(data: T): Promise<T> {
    const sqlite = this.sqliteState();
    if (sqlite) {
      await sqlite.repository.put(createRecord({ id: sqlite.id, kind: "program.state", data }));
      return data;
    }
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify({ version: 1, data }, null, 2)}\n`, "utf8");
    try {
      await renameWithWindowsRetry(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
    return data;
  }

  private sqliteState(): { repository: SQLiteRepository<T>; id: string } | null {
    const state = sqliteStateForPath(this.filePath);
    return state ? { repository: state.repository as SQLiteRepository<T>, id: state.id } : null;
  }

  private static async withFileLock<TResult>(filePath: string, operation: () => Promise<TResult>): Promise<TResult> {
    const key = path.resolve(filePath).toLowerCase();
    const previous = ProgramJsonStore.writeLocks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(
      () => current,
      () => current,
    );
    ProgramJsonStore.writeLocks.set(key, chained);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (ProgramJsonStore.writeLocks.get(key) === chained) ProgramJsonStore.writeLocks.delete(key);
    }
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

export class ProgramDocumentTransaction {
  constructor(
    private readonly rootDir: string,
    private readonly kind: string,
    private readonly transaction: SQLiteTransaction,
  ) {}

  async read<T extends JsonObject>(filePath: string, empty: () => T): Promise<T> {
    const state = this.state(filePath);
    const row = await this.transaction.get<{ data: string }>(`select data from ${state.repository.tableName} where id = ?`, [state.id]);
    return row ? (JSON.parse(row.data) as T) : empty();
  }

  async write<T extends JsonObject>(filePath: string, data: T): Promise<T> {
    const state = this.state(filePath);
    const now = Date.now();
    await this.transaction.run(
      `
      insert into ${state.repository.tableName} (id, kind, data, created_at_ms, updated_at_ms)
      values (?, ?, ?, ?, ?)
      on conflict(id) do update set data = excluded.data, updated_at_ms = excluded.updated_at_ms
    `,
      [state.id, this.kind, JSON.stringify(data), now, now],
    );
    return data;
  }

  async deletePath(targetPath: string): Promise<void> {
    const state = this.state(targetPath);
    if (path.extname(targetPath).toLowerCase() === ".json") {
      await this.transaction.run(`delete from ${state.repository.tableName} where id = ?`, [state.id]);
      return;
    }
    await this.transaction.run(`delete from ${state.repository.tableName} where id = ? or id like ?`, [state.id, `${state.id.replace(/\/$/, "")}/%`]);
  }

  private state(filePath: string): NonNullable<ReturnType<typeof sqliteStateForPath>> {
    const state = sqliteStateForPath(filePath);
    if (!state || state.rootDir !== this.rootDir || state.kind !== this.kind) {
      throw new Error(`Program document transaction cannot cross storage owners: ${filePath}`);
    }
    return state;
  }
}

function sqliteStateForPath(targetPath: string): { repository: SQLiteRepository<JsonObject>; id: string; rootDir: string; kind: string } | null {
  const resolved = path.resolve(targetPath);
  let current = path.dirname(resolved);
  while (true) {
    const configPath = path.join(current, "config.json");
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf8")) as { layoutVersion?: unknown };
        if (config.layoutVersion !== 2) return null;
        const relative = path.relative(current, resolved).replaceAll("\\", "/");
        const programPrefix = "programs/";
        const automationPrefix = "artifacts/automation-studio/";
        if (relative.startsWith(programPrefix)) {
          return {
            repository: new SQLiteRepository({ rootDir: current, kind: "program.state", layoutVersion: 2 }),
            id: relative.slice(programPrefix.length).replace(/\.json$/i, ""),
            rootDir: current,
            kind: "program.state",
          };
        }
        if (relative.startsWith(automationPrefix)) {
          return {
            repository: new SQLiteRepository({ rootDir: current, kind: "automation.state", layoutVersion: 2 }),
            id: relative.slice(automationPrefix.length).replace(/\.json$/i, ""),
            rootDir: current,
            kind: "automation.state",
          };
        }
      } catch {
        return null;
      }
      return null;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function programDataFile(rootDir: string, programId: string, fileName: string): string {
  return path.join(rootDir, "programs", safeSegment(programId), fileName);
}

export function normalizeScope(scope: RepositoryScope = {}): RepositoryScope {
  const domainId = scope.domainId?.trim().toLowerCase();
  return domainId ? { domainId } : {};
}

export function scopeKey(scope: RepositoryScope = {}): string {
  return normalizeScope(scope).domainId ?? "global";
}

export function safeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_");
}

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function renameWithWindowsRetry(source: string, target: string): Promise<void> {
  const delays = [4, 12, 28, 60, 120];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= delays.length || (code !== "EPERM" && code !== "EACCES" && code !== "EBUSY")) throw error;
      await delay(delays[attempt] ?? 0);
    }
  }
}
