import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { JsonObject } from "../../../core/index.ts";
import { safeSegment } from "../../_shared/storage.ts";
import type { AutomationStudioObjectIndex, AutomationStudioObjectOwner, AutomationStudioObjectSummary } from "./file-store.ts";

export const AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES = 256 * 1024;

export type AutomationStudioObjectReference = {
  $fluxiqObject: {
    sha256: string;
    size: number;
    mediaType: string;
    relativePath: string;
    recordingId?: string;
  };
};

export type AutomationStudioObjectAsset = {
  sha256: string;
  size: number;
  mediaType: string;
  content: Buffer;
};

type AutomationStudioObjectIndexEntry = AutomationStudioObjectSummary & {
  recordingId?: string;
};

export type AutomationStudioObjectWriteOptions = {
  extension?: string;
  recordingId?: string;
};

export class AutomationStudioObjectStore {
  private readonly projectIndexLocks = new Map<string, Promise<void>>();

  constructor(readonly rootDir: string) {}

  async putJson(projectId: string, value: JsonObject): Promise<AutomationStudioObjectReference> {
    const content = Buffer.from(JSON.stringify(value), "utf8");
    return this.putBytes(projectId, content, "application/json", "json");
  }

  async putBytes(projectId: string, content: Buffer | Uint8Array, mediaType: string, options: AutomationStudioObjectWriteOptions | string = {}): Promise<AutomationStudioObjectReference> {
    const writeOptions = typeof options === "string" ? { extension: options } : options;
    const bytes = Buffer.from(content);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existingReference = await this.projectObjectReference(projectId, sha256);
    if (existingReference) {
      const existing = await stat(this.resolveReferencePath(existingReference)).catch(() => null);
      if (existing?.size === bytes.length) return existingReference;
      if (existing) throw new Error(`Object hash collision for project ${projectId}: ${sha256}`);
    }
    const extension = writeOptions.extension ?? extensionForMediaType(mediaType);
    const relativePath = objectRelativePath(projectId, sha256, safeObjectExtension(extension), writeOptions.recordingId);
    const target = path.join(this.rootDir, relativePath);
    try {
      const existing = await stat(target);
      if (existing.size !== bytes.length) throw new Error(`Object hash collision at ${target}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, bytes);
      try {
        await rename(temporary, target);
      } catch (renameError) {
        await rm(temporary, { force: true });
        const existing = await readFile(target).catch(() => null);
        if (!existing || createHash("sha256").update(existing).digest("hex") !== sha256) throw renameError;
      }
    }
    const reference = {
      $fluxiqObject: {
        sha256,
        size: bytes.length,
        mediaType: safeMediaType(mediaType),
        relativePath: relativePath.replaceAll("\\", "/"),
        ...(writeOptions.recordingId ? { recordingId: writeOptions.recordingId } : {})
      }
    };
    await this.upsertProjectObjectIndex(projectId, reference);
    return reference;
  }

  async readJson(reference: AutomationStudioObjectReference): Promise<JsonObject> {
    const { content } = await this.readBytes(reference);
    return JSON.parse(content.toString("utf8")) as JsonObject;
  }

  async readBytes(reference: AutomationStudioObjectReference): Promise<AutomationStudioObjectAsset> {
    const target = this.resolveReferencePath(reference);
    const content = await readFile(target);
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== reference.$fluxiqObject.sha256) throw new Error(`Automation Studio object digest mismatch: ${reference.$fluxiqObject.relativePath}`);
    return {
      sha256: reference.$fluxiqObject.sha256,
      size: content.length,
      mediaType: reference.$fluxiqObject.mediaType,
      content
    };
  }

  async readProjectObject(projectId: string, sha256: string): Promise<AutomationStudioObjectAsset> {
    if (!isSha256(sha256)) throw new Error("Automation Studio object digest is invalid.");
    const index = await this.readProjectObjectIndex(projectId);
    const entry = objectEntry(index, sha256);
    if (!entry) throw new Error("Automation Studio object was not found for this project.");
    return this.readBytes(compactObjectReference(entry));
  }

  async listProjectObjectSha256s(projectId: string): Promise<string[]> {
    const index = await this.readProjectObjectIndex(projectId);
    return index.objects.map((entry) => entry.sha256).sort();
  }

  async deleteProjectObjects(projectId: string, sha256s: Iterable<string>): Promise<{ deleted: string[] }> {
    const requested = new Set([...sha256s].map((sha256) => sha256.toLowerCase()).filter(isSha256));
    if (!requested.size) return { deleted: [] };
    const deleted: string[] = [];
    await this.withProjectIndexLock(projectId, async () => {
      const index = await this.readProjectObjectIndex(projectId);
      const paths: string[] = [];
      for (const sha256 of requested) {
        const entry = objectEntry(index, sha256);
        if (!entry) continue;
        paths.push(this.resolveReferencePath({ $fluxiqObject: entry }));
        deleted.push(sha256);
      }
      index.objects = index.objects.filter((entry) => !requested.has(entry.sha256));
      await Promise.all(paths.map((filePath) => rm(filePath, { force: true })));
      if (deleted.length) await this.writeProjectObjectIndex(projectId, index);
    });
    return { deleted };
  }

  async deleteRecordingObjects(projectId: string, recordingId: string, protectedSha256s: Iterable<string> = []): Promise<{ deleted: string[] }> {
    const protectedSet = new Set([...protectedSha256s].map((sha256) => sha256.toLowerCase()).filter(isSha256));
    const index = await this.readProjectObjectIndex(projectId);
    const prefix = recordingObjectRelativePrefix(projectId, recordingId).replaceAll("\\", "/");
    const scoped = (index.objects as AutomationStudioObjectIndexEntry[])
      .filter((entry) => entry.owner.kind === "recording" && entry.owner.recordingId === recordingId || entry.recordingId === recordingId || entry.relativePath.replaceAll("\\", "/").startsWith(prefix));
    for (const entry of scoped) {
      if (protectedSet.has(entry.sha256)) await this.moveProjectObject(projectId, entry.sha256);
    }
    const candidates = scoped.map((entry) => entry.sha256).filter((sha256) => !protectedSet.has(sha256));
    const result = await this.deleteProjectObjects(projectId, candidates);
    await rm(path.join(this.rootDir, prefix), { recursive: true, force: true });
    return result;
  }

  async moveProjectObject(projectId: string, sha256: string, scope: { recordingId?: string } = {}): Promise<AutomationStudioObjectReference | null> {
    if (!isSha256(sha256)) return null;
    return this.withProjectIndexLock(projectId, async () => {
      const index = await this.readProjectObjectIndex(projectId);
      const entry = objectEntry(index, sha256.toLowerCase());
      if (!entry) return null;
      const extension = path.extname(entry.relativePath).slice(1) || extensionForMediaType(entry.mediaType);
      const nextRelativePath = objectRelativePath(projectId, entry.sha256, safeObjectExtension(extension), scope.recordingId).replaceAll("\\", "/");
      const currentRelativePath = entry.relativePath.replaceAll("\\", "/");
      const nextEntry = {
        ...entry,
        relativePath: nextRelativePath,
        owner: objectOwner(scope.recordingId),
        ...(scope.recordingId ? { recordingId: scope.recordingId } : {})
      };
      if (!scope.recordingId) delete nextEntry.recordingId;
      if (currentRelativePath !== nextRelativePath) {
        const currentPath = this.resolveReferencePath(compactObjectReference(entry));
        const nextPath = path.join(this.rootDir, nextRelativePath);
        await mkdir(path.dirname(nextPath), { recursive: true });
        try {
          await rename(currentPath, nextPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await stat(nextPath);
        }
      }
      index.objects = upsertObjectEntry(index.objects, nextEntry);
      await this.writeProjectObjectIndex(projectId, index);
      return compactObjectReference(nextEntry);
    });
  }

  contentRef(projectId: string, reference: AutomationStudioObjectReference): string {
    return automationStudioObjectContentRef(projectId, reference.$fluxiqObject.sha256);
  }

  private resolveReferencePath(reference: AutomationStudioObjectReference): string {
    const target = path.resolve(this.rootDir, reference.$fluxiqObject.relativePath);
    const root = `${path.resolve(this.rootDir)}${path.sep}`;
    if (!target.startsWith(root)) throw new Error("Automation Studio object reference escapes its storage root.");
    return target;
  }

  private async readProjectObjectIndex(projectId: string): Promise<AutomationStudioObjectIndex> {
    const filePath = path.join(this.rootDir, "projects", safeSegment(projectId), "indexes", "objects.json");
    const content = await readFile(filePath, "utf8").catch(() => "");
    if (!content) return { schemaVersion: "0.1", objects: [] };
    const parsed = JSON.parse(content) as Partial<AutomationStudioObjectIndex>;
    return parsed.schemaVersion === "0.1" && Array.isArray(parsed.objects)
      ? { schemaVersion: "0.1", objects: parsed.objects }
      : { schemaVersion: "0.1", objects: [] };
  }

  private async projectObjectReference(projectId: string, sha256: string): Promise<AutomationStudioObjectReference | null> {
    const index = await this.readProjectObjectIndex(projectId);
    const entry = objectEntry(index, sha256);
    return entry ? compactObjectReference(entry) : null;
  }

  private async upsertProjectObjectIndex(projectId: string, reference: AutomationStudioObjectReference): Promise<void> {
    await this.withProjectIndexLock(projectId, async () => {
      const index = await this.readProjectObjectIndex(projectId);
      const entry: AutomationStudioObjectIndexEntry = {
        ...reference.$fluxiqObject,
        owner: objectOwner(reference.$fluxiqObject.recordingId),
        createdAt: Date.now()
      };
      index.objects = upsertObjectEntry(index.objects, entry);
      await this.writeProjectObjectIndex(projectId, index);
    });
  }

  private async writeProjectObjectIndex(projectId: string, index: AutomationStudioObjectIndex): Promise<void> {
    const filePath = path.join(this.rootDir, "projects", safeSegment(projectId), "indexes", "objects.json");
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(index, null, 2));
    await replaceFileWithRetry(temporary, filePath);
  }

  private async withProjectIndexLock<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const key = safeSegment(projectId);
    const previous = this.projectIndexLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const chained = previous.then(() => next, () => next);
    this.projectIndexLocks.set(key, chained);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.projectIndexLocks.get(key) === chained) this.projectIndexLocks.delete(key);
    }
  }
}

async function replaceFileWithRetry(source: string, destination: string): Promise<void> {
  const retryableCodes = new Set(["EPERM", "EBUSY", "EACCES"]);
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has((error as NodeJS.ErrnoException).code ?? "")) {
        await rm(source, { force: true }).catch(() => undefined);
        throw error;
      }
      await sleep(25 * (attempt + 1));
    }
  }
  try {
    await writeFile(destination, await readFile(source));
    await rm(source, { force: true });
  } catch {
    await rm(source, { force: true }).catch(() => undefined);
    throw lastError;
  }
}

export function isAutomationStudioObjectReference(value: JsonObject): value is JsonObject & AutomationStudioObjectReference {
  const reference = value.$fluxiqObject;
  return Boolean(reference && typeof reference === "object" && !Array.isArray(reference) && typeof (reference as JsonObject).sha256 === "string" && typeof (reference as JsonObject).relativePath === "string");
}

export function automationStudioObjectContentRef(projectId: string, sha256: string): string {
  return `automation-object://project/${encodeURIComponent(projectId)}/${sha256}`;
}

export function automationStudioObjectApiPath(projectId: string, sha256: string): string {
  return `/api/programs/automation-studio/state-assets/${encodeURIComponent(projectId)}/${sha256}`;
}

export function parseAutomationStudioObjectContentRef(contentRef: string): { projectId: string; sha256: string } | null {
  const trimmed = contentRef.trim();
  const schemeMatch = /^automation-object:\/\/project\/([^/]+)\/([a-f0-9]{64})$/i.exec(trimmed);
  if (schemeMatch) return { projectId: decodeURIComponent(schemeMatch[1]!), sha256: schemeMatch[2]!.toLowerCase() };
  const apiMatch = /^\/api\/programs\/automation-studio\/state-assets\/([^/]+)\/([a-f0-9]{64})$/i.exec(trimmed);
  if (apiMatch) return { projectId: decodeURIComponent(apiMatch[1]!), sha256: apiMatch[2]!.toLowerCase() };
  return null;
}

function safeMediaType(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(trimmed) ? trimmed : "application/octet-stream";
}

function extensionForMediaType(mediaType: string): string {
  switch (safeMediaType(mediaType)) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "application/json": return "json";
    default: return "bin";
  }
}

function safeObjectExtension(value: string): string {
  return /^[a-z0-9]{1,12}$/i.test(value) ? value.toLowerCase() : "bin";
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function objectRelativePath(projectId: string, sha256: string, extension: string, recordingId?: string): string {
  return recordingId
    ? path.join(recordingObjectRelativePrefix(projectId, recordingId), `${sha256}.${extension}`)
    : path.join("projects", safeSegment(projectId), "objects", "shared", `${sha256}.${extension}`);
}

function recordingObjectRelativePrefix(projectId: string, recordingId: string): string {
  return path.join("projects", safeSegment(projectId), "recordings", safeSegment(recordingId), "objects");
}

function objectEntry(index: AutomationStudioObjectIndex, sha256: string): AutomationStudioObjectIndexEntry | undefined {
  return index.objects.find((entry) => entry.sha256 === sha256.toLowerCase()) as AutomationStudioObjectIndexEntry | undefined;
}

function compactObjectReference(entry: AutomationStudioObjectIndexEntry): AutomationStudioObjectReference {
  return {
    $fluxiqObject: {
      sha256: entry.sha256,
      size: entry.size,
      mediaType: entry.mediaType,
      relativePath: entry.relativePath,
      ...(entry.recordingId ? { recordingId: entry.recordingId } : {})
    }
  };
}

function upsertObjectEntry(entries: AutomationStudioObjectSummary[], entry: AutomationStudioObjectIndexEntry): AutomationStudioObjectIndexEntry[] {
  return [...entries.filter((item) => item.sha256 !== entry.sha256), entry].sort((left, right) => left.sha256.localeCompare(right.sha256)) as AutomationStudioObjectIndexEntry[];
}

function objectOwner(recordingId?: string): AutomationStudioObjectOwner {
  return recordingId ? { kind: "recording", recordingId } : { kind: "shared" };
}
