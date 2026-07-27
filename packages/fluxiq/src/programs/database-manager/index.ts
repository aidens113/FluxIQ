import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../core";

export type RepositoryScope = {
  domainId?: string | null;
};

export type RecordEnvelope<T extends JsonObject = JsonObject> = {
  id: string;
  scope: RepositoryScope;
  kind: string;
  data: T;
  createdAtMs: number;
  updatedAtMs: number;
};

export type Repository<T extends JsonObject = JsonObject> = {
  list(scope?: RepositoryScope): Promise<Array<RecordEnvelope<T>>>;
  get(id: string, scope?: RepositoryScope): Promise<RecordEnvelope<T> | null>;
  put(record: RecordEnvelope<T>): Promise<RecordEnvelope<T>>;
  delete(id: string, scope?: RepositoryScope): Promise<boolean>;
};

export type Migration = {
  id: string;
  description: string;
  up(): Promise<void>;
  down?(): Promise<void>;
};

export type FileRepositoryOptions = {
  rootDir: string;
  kind: string;
};

export class FileRepository<T extends JsonObject = JsonObject> implements Repository<T> {
  readonly rootDir: string;
  readonly kind: string;

  constructor(options: FileRepositoryOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.kind = safeSegment(options.kind);
    if (!this.kind) {
      throw new Error("Repository kind is required");
    }
  }

  async list(scope: RepositoryScope = {}): Promise<Array<RecordEnvelope<T>>> {
    const index = await this.readIndex(scope);
    return Object.values(index.records).sort((left, right) => left.id.localeCompare(right.id));
  }

  async get(id: string, scope: RepositoryScope = {}): Promise<RecordEnvelope<T> | null> {
    const index = await this.readIndex(scope);
    return index.records[id] ?? null;
  }

  async put(record: RecordEnvelope<T>): Promise<RecordEnvelope<T>> {
    const scope = normalizeScope(record.scope);
    const now = Date.now();
    const index = await this.readIndex(scope);
    const existing = index.records[record.id];
    const next: RecordEnvelope<T> = {
      ...record,
      kind: this.kind,
      scope,
      createdAtMs: existing?.createdAtMs ?? (record.createdAtMs || now),
      updatedAtMs: now
    };
    index.records[next.id] = next;
    await this.writeIndex(scope, index);
    return next;
  }

  async delete(id: string, scope: RepositoryScope = {}): Promise<boolean> {
    const index = await this.readIndex(scope);
    if (!index.records[id]) {
      return false;
    }
    delete index.records[id];
    await this.writeIndex(scope, index);
    return true;
  }

  private scopeDir(scope: RepositoryScope): string {
    const normalized = normalizeScope(scope);
    const scopeSegment = normalized.domainId ? path.join("domains", safeSegment(normalized.domainId)) : "global";
    return path.join(this.rootDir, scopeSegment, this.kind);
  }

  private indexPath(scope: RepositoryScope): string {
    return path.join(this.scopeDir(scope), "records.json");
  }

  private async readIndex(scope: RepositoryScope): Promise<FileRepositoryIndex<T>> {
    const filePath = this.indexPath(scope);
    try {
      const payload = JSON.parse(await readFile(filePath, "utf8")) as Partial<FileRepositoryIndex<T>>;
      return {
        version: 1,
        records: isRecordMap<T>(payload.records) ? payload.records : {}
      };
    } catch {
      return { version: 1, records: {} };
    }
  }

  private async writeIndex(scope: RepositoryScope, index: FileRepositoryIndex<T>): Promise<void> {
    const directory = this.scopeDir(scope);
    await mkdir(directory, { recursive: true });
    const filePath = this.indexPath(scope);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    try {
      await rename(tempPath, filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }
}

type FileRepositoryIndex<T extends JsonObject> = {
  version: 1;
  records: Record<string, RecordEnvelope<T>>;
};

export function createRecord<T extends JsonObject>(params: {
  id: string;
  kind: string;
  data: T;
  scope?: RepositoryScope;
  nowMs?: number;
}): RecordEnvelope<T> {
  const now = params.nowMs ?? Date.now();
  return {
    id: params.id,
    kind: safeSegment(params.kind),
    scope: normalizeScope(params.scope ?? {}),
    data: params.data,
    createdAtMs: now,
    updatedAtMs: now
  };
}

function normalizeScope(scope: RepositoryScope): RepositoryScope {
  const domainId = scope.domainId?.trim().toLowerCase();
  return domainId ? { domainId } : {};
}

function safeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

function isRecordMap<T extends JsonObject>(value: unknown): value is Record<string, RecordEnvelope<T>> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
