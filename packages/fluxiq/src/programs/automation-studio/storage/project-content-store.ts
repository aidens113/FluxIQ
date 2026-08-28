import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectObjectRepository, type AutomationStudioProjectObjectRecord, type AutomationStudioProjectObjectReferenceRecord } from "./project-object-repository.ts";

export type AutomationStudioProjectContentWrite = {
  object: AutomationStudioProjectObjectRecord;
  reference: AutomationStudioProjectObjectReferenceRecord | null;
  contentPath: string;
  deduped: boolean;
};

export type AutomationStudioProjectContentAsset = AutomationStudioProjectObjectRecord & { content: Buffer };

export class AutomationStudioProjectContentStore {
  private readonly rootDir: string;
  private readonly projectId: string;

  private constructor(private readonly objects: AutomationStudioProjectObjectRepository, input: { rootDir: string; projectId: string }) {
    this.rootDir = path.resolve(input.rootDir);
    this.projectId = input.projectId;
  }

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectContentStore> {
    const objects = await AutomationStudioProjectObjectRepository.open({ pool: input.pool, projectId: input.projectId });
    return new AutomationStudioProjectContentStore(objects, { rootDir: input.pool.rootDir, projectId: input.projectId });
  }

  close(): Promise<void> {
    return this.objects.close();
  }

  async putBytes(input: {
    content: Buffer | Uint8Array;
    mediaType: string;
    extension?: string;
    owner?: { ownerKind: string; ownerId: string; purpose: string; referenceId?: string };
    transactionId?: string;
    createdAt?: number;
  }): Promise<AutomationStudioProjectContentWrite> {
    const content = Buffer.from(input.content);
    const sha256 = createHash("sha256").update(content).digest("hex");
    const extension = safeExtension(input.extension ?? extensionForMediaType(input.mediaType));
    const relativePath = objectRelativePath(this.projectId, sha256, extension);
    const target = this.resolveProjectPath(relativePath);
    const existing = await this.objects.getBySha256(sha256);
    let deduped = false;
    if (existing) {
      await this.verifyExistingFile(existing, content.length, sha256);
      deduped = true;
    } else {
      await this.writeStagedObject(input.transactionId ?? randomUUID(), target, `${sha256}.${extension}`, content);
    }
    const object = await this.objects.upsertObject({
      objectId: `object:${sha256}`,
      sha256,
      mediaType: input.mediaType,
      byteCount: content.length,
      relativePath,
      compression: null,
      encryption: null,
      verifiedAt: input.createdAt ?? Date.now(),
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {})
    });
    const reference = input.owner ? await this.objects.addReference({
      referenceId: input.owner.referenceId ?? `reference:${input.owner.ownerKind}:${input.owner.ownerId}:${input.owner.purpose}:${sha256}`,
      objectId: object.objectId,
      ownerKind: input.owner.ownerKind,
      ownerId: input.owner.ownerId,
      purpose: input.owner.purpose,
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {})
    }) : null;
    return { object, reference, contentPath: target, deduped };
  }

  async putJson(input: Omit<Parameters<AutomationStudioProjectContentStore["putBytes"]>[0], "content" | "mediaType" | "extension"> & { value: unknown }): Promise<AutomationStudioProjectContentWrite> {
    return this.putBytes({ ...input, content: Buffer.from(JSON.stringify(input.value), "utf8"), mediaType: "application/json", extension: "json" });
  }

  async readBytesBySha256(sha256: string): Promise<AutomationStudioProjectContentAsset> {
    const object = await this.objects.getBySha256(sha256);
    if (!object) throw new Error("Automation Studio object was not found for this project.");
    const content = await readFile(this.resolveProjectPath(object.relativePath));
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== object.sha256) throw new Error(`Automation Studio object digest mismatch: ${object.relativePath}`);
    return { ...object, content };
  }

  async cleanupStaging(input: { olderThanMs?: number; now?: number } = {}): Promise<{ deleted: string[] }> {
    const stagingRoot = this.resolveProjectPath(path.join("projects", this.projectId, "staging"));
    const entries = await readdir(stagingRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const cutoff = (input.now ?? Date.now()) - Math.max(0, Math.trunc(input.olderThanMs ?? 60_000));
    const deleted: string[] = [];
    for (const entry of entries) {
      const target = path.join(stagingRoot, entry.name);
      const info = await stat(target).catch(() => null);
      if (!info || info.mtimeMs > cutoff) continue;
      await rm(target, { recursive: true, force: true });
      deleted.push(path.relative(this.rootDir, target).replaceAll(path.sep, "/"));
    }
    return { deleted };
  }

  async sweepUnreferencedObjects(input: { limit?: number } = {}): Promise<{ deleted: string[] }> {
    const candidates = await this.objects.listUnreferencedObjects(input.limit ?? 100);
    const deleted: string[] = [];
    for (const object of candidates) {
      await rm(this.resolveProjectPath(object.relativePath), { force: true });
      if (await this.objects.deleteObject(object.objectId)) deleted.push(object.objectId);
    }
    return { deleted };
  }

  private async writeStagedObject(transactionId: string, target: string, fileName: string, content: Buffer): Promise<void> {
    await mkdir(path.dirname(target), { recursive: true });
    const stagingDir = this.resolveProjectPath(path.join("projects", this.projectId, "staging", safeSegment(transactionId)));
    await mkdir(stagingDir, { recursive: true });
    const temporary = path.join(stagingDir, fileName);
    await writeFile(temporary, content);
    try {
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      const existing = await readFile(target).catch(() => null);
      if (!existing || createHash("sha256").update(existing).digest("hex") !== createHash("sha256").update(content).digest("hex")) throw error;
    }
  }

  private async verifyExistingFile(object: AutomationStudioProjectObjectRecord, byteCount: number, sha256: string): Promise<void> {
    const target = this.resolveProjectPath(object.relativePath);
    const info = await stat(target).catch(() => null);
    if (!info) throw new Error(`Automation Studio object metadata exists but content is missing: ${object.objectId}`);
    if (info.size !== byteCount) throw new Error(`Automation Studio object hash collision for ${sha256}.`);
  }

  private resolveProjectPath(relativePath: string): string {
    const target = path.resolve(this.rootDir, relativePath);
    const root = `${this.rootDir}${path.sep}`;
    if (!target.startsWith(root)) throw new Error("Automation Studio project content path escapes its storage root.");
    return target;
  }
}

function objectRelativePath(projectId: string, sha256: string, extension: string): string {
  return path.join("projects", safeSegment(projectId), "objects", "sha256", sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.${extension}`).replaceAll(path.sep, "/");
}

function extensionForMediaType(mediaType: string): string {
  switch (mediaType.trim().toLowerCase()) {
    case "application/json": return "json";
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    default: return "bin";
  }
}

function safeExtension(value: string): string {
  return /^[a-z0-9]{1,12}$/i.test(value) ? value.toLowerCase() : "bin";
}

function safeSegment(value: string): string {
  const segment = value.trim();
  if (!segment || segment.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(segment)) throw new Error("Automation Studio path segment is invalid.");
  return segment;
}
