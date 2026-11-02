import { randomUUID } from "node:crypto";
import { mkdir, open as openFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { JsonObject } from "../../../core/index.ts";
import { createRecord, type SQLiteRepository } from "../sqlite/index.ts";
import { isJsonObject } from "../json/index.ts";
import type { JsonFileDocument } from "./file-document.ts";
import { ProgramStateReadError } from "./read-error.ts";
import { ProgramDocumentTransaction } from "./document-transaction.ts";
import { sqliteStateForPath } from "./sqlite-path.ts";

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

  /** No empty default, repair, schema creation or fallback from an owning SQLite layout. */
  async readExistingReadOnly(): Promise<T | null> {
    return (await ProgramJsonStore.readExistingReadOnlyMany([this.filePath]))[0] as T | null;
  }

  /** Closed layout identity only; never opens SQLite or initializes missing state. */
  static async existingOwningLayout(filePath: string): Promise<Readonly<{ layoutVersion: 2; rootDir: string; kind: "automation.state" | "program.state"; documentId: string }> | null> {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath) || filePath.length > 4096 || filePath.includes("\0")) throw new Error("program_state.owning_path");
    const resolved = path.resolve(filePath);
    let current = path.dirname(resolved);
    while (true) {
      let handle: Awaited<ReturnType<typeof openFile>>;
      try { handle = await openFile(path.join(current, "config.json"), "r"); }
      catch (error) {
        if (!isNodeError(error, "ENOENT")) throw error;
        const parent = path.dirname(current);
        if (parent === current) return null;
        current = parent;
        continue;
      }
      let text: string;
      try {
        const before = await handle.stat();
        if (!before.isFile() || before.size > 8192) throw new Error("program_state.owning_config_size");
        const bytes = Buffer.alloc(8193);
        let used = 0;
        while (used < bytes.length) {
          const observed = await handle.read(bytes, used, bytes.length - used, used);
          if (!observed.bytesRead) break;
          used += observed.bytesRead;
        }
        if (used > 8192) throw new Error("program_state.owning_config_size");
        const after = await handle.stat();
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("program_state.owning_layout_changed");
        text = bytes.subarray(0, used).toString("utf8");
      } finally { await handle.close(); }
      const config: unknown = JSON.parse(text);
      if (!isJsonObject(config) || ![1, 2].includes(Number(config.layoutVersion))) throw new Error("program_state.owning_layout");
      if (config.layoutVersion === 1) return null;
      if (config.layoutVersion !== 2) throw new Error("program_state.owning_layout");
      const relative = path.relative(current, resolved).replaceAll("\\", "/");
      const prefix = relative.startsWith("artifacts/automation-studio/") ? "artifacts/automation-studio/" : relative.startsWith("programs/") ? "programs/" : null;
      if (!prefix) throw new Error("program_state.owning_path");
      const documentId = relative.slice(prefix.length).replace(/\.json$/i, "");
      if (!documentId || documentId.length > 1024 || documentId.includes("\0")) throw new Error("program_state.owning_path");
      return Object.freeze({ layoutVersion: 2 as const, rootDir: current, kind: prefix === "programs/" ? "program.state" as const : "automation.state" as const, documentId });
    }
  }

  /** Existing documents from one owning SQL snapshot, or bounded file observations. */
  static async readExistingReadOnlyMany(filePaths: readonly string[]): Promise<Array<JsonObject | null>> {
    if (!Array.isArray(filePaths) || filePaths.length < 1 || filePaths.length > 256 || filePaths.some(value => typeof value !== "string" || !path.isAbsolute(value))) throw new Error("program_state.readonly_paths");
    const paths = filePaths.map(value => path.resolve(value));
    const states = paths.map(value => sqliteStateForPath(value, true));
    const first = states[0];
    if (first) {
      if (states.some(state => !state || state.rootDir !== first.rootDir || state.kind !== first.kind)) throw new Error("program_state.readonly_mixed_layout");
      const records = await first.repository.getExistingReadOnlyMany(states.map(state => state!.id));
      // Resolve again after the asynchronous read; a changed owning layout cannot supply proof.
      if (paths.some((value, index) => {
        const current = sqliteStateForPath(value, true);
        return !current || current.rootDir !== first.rootDir || current.kind !== first.kind || current.id !== states[index]!.id;
      })) throw new Error("program_state.readonly_layout_changed");
      return records.map(record => {
        if (!record) return null;
        if (!isJsonObject(record.data)) throw new Error("program_state.readonly_data");
        return record.data;
      });
    }
    if (states.some(Boolean)) throw new Error("program_state.readonly_mixed_layout");
    const documents: Array<JsonObject | null> = [];
    let observedBytes = 0;
    for (const filePath of paths) {
      try {
        const limit = Math.min(4 * 1024 * 1024, 8 * 1024 * 1024 - observedBytes), handle = await openFile(filePath, "r");
        let text: string;
        try {
          const info = await handle.stat();
          if (!info.isFile() || info.size > limit) throw new Error("program_state.observation_size");
          const bytes = Buffer.alloc(limit + 1);
          let used = 0;
          while (used < bytes.length) {
            const read = await handle.read(bytes, used, bytes.length - used, used);
            if (!read.bytesRead) break;
            used += read.bytesRead;
          }
          if (used > limit) throw new Error("program_state.observation_size");
          observedBytes += used;
          const after = await handle.stat();
          if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new Error("program_state.readonly_file_changed");
          text = bytes.subarray(0, used).toString("utf8");
        } finally { await handle.close(); }
        const payload: unknown = JSON.parse(text);
        if (!isJsonObject(payload) || payload.version !== 1 || !isJsonObject(payload.data)) throw new Error("program_state.readonly_envelope");
        documents.push(payload.data);
      } catch (error) { if (isNodeError(error, "ENOENT")) documents.push(null); else throw error; }
    }
    if (paths.some(value => sqliteStateForPath(value, true))) throw new Error("program_state.readonly_layout_changed");
    return documents;
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
        try {
          const data = this.empty();
          await this.writeUnlocked(data);
          return { backupPath, data };
        } catch (writeError) {
          try {
            await rename(backupPath, this.filePath);
          } catch (restoreError) {
            throw new AggregateError([writeError, restoreError], "Program state write and backup restoration failed.", { cause: writeError });
          }
          throw writeError;
        }
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
    // Only this directory's documents are read: the rest of the table (run
    // sessions of many megabytes each) is never loaded or parsed.
    const records = await sqlite.repository.listByIdPrefix(prefix, {
      select: (id) => id.endsWith(suffix) && !id.slice(prefix.length, -suffix.length).includes("/"),
    });
    return records.map((record) => record.data as TDocument);
  }

  static async deletePath(targetPath: string): Promise<boolean> {
    const sqlite = sqliteStateForPath(targetPath);
    if (!sqlite) return false;
    const isDocument = path.extname(targetPath).toLowerCase() === ".json";
    if (isDocument) return await sqlite.repository.delete(sqlite.id);
    const prefix = `${sqlite.id.replace(/\/$/, "")}/`;
    // The ids come from the primary-key index; no row's data is read.
    const ids = [sqlite.id, ...(await sqlite.repository.listIdsByPrefix(prefix))];
    let deleted = false;
    for (const id of ids) deleted = (await sqlite.repository.delete(id)) || deleted;
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

  /** Whether this document is the file at `filePath`, rather than a record in the storage layout's SQLite state. */
  isFileBacked(): boolean {
    return this.sqliteState() === null;
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
