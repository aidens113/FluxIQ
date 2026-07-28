import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, JsonValue } from "../../core";
import type { RepositoryScope } from "../database-manager";

export type JsonFileDocument<T extends JsonObject = JsonObject> = {
  version: 1;
  data: T;
};

export class ProgramJsonStore<T extends JsonObject = JsonObject> {
  readonly filePath: string;

  constructor(filePath: string, private readonly empty: () => T) {
    this.filePath = path.resolve(filePath);
  }

  async read(): Promise<T> {
    try {
      const payload = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<JsonFileDocument<T>>;
      if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
        return payload.data as T;
      }
    } catch {
      // Missing or malformed program state is treated as an empty store.
    }
    return this.empty();
  }

  async write(data: T): Promise<T> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify({ version: 1, data }, null, 2)}\n`, "utf8");
    try {
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
    return data;
  }

  async update(mutator: (data: T) => T | void | Promise<T | void>): Promise<T> {
    const data = await this.read();
    const result = await mutator(data);
    return this.write(result ?? data);
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
  return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
