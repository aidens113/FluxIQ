import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { AutomationStudioObjectIndex, AutomationStudioObjectOwner, AutomationStudioObjectSummary } from "./file-store.ts";
import type { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectObjectRepository } from "./project-object-repository.ts";

export type AutomationStudioLegacyObjectIndexMigrationResult = {
  importedObjects: number;
  importedReferences: number;
  skippedObjects: number;
  missingFiles: Array<{ sha256: string; relativePath: string }>;
};

export async function migrateAutomationStudioLegacyObjectIndex(input: { rootDir: string; pool: AutomationStudioProjectDatabasePool; projectId: string; verifyFiles?: boolean; limit?: number }): Promise<AutomationStudioLegacyObjectIndexMigrationResult> {
  const indexPath = path.join(input.rootDir, "projects", safeSegment(input.projectId), "indexes", "objects.json");
  const content = await readFile(indexPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (!content) return { importedObjects: 0, importedReferences: 0, skippedObjects: 0, missingFiles: [] };
  const index = parseLegacyIndex(content);
  const limit = Math.max(1, Math.min(index.objects.length, Math.trunc(input.limit ?? index.objects.length)));
  const repository = await AutomationStudioProjectObjectRepository.open({ pool: input.pool, projectId: input.projectId });
  const result: AutomationStudioLegacyObjectIndexMigrationResult = { importedObjects: 0, importedReferences: 0, skippedObjects: 0, missingFiles: [] };
  try {
    for (const [indexPosition, entry] of index.objects.slice(0, limit).entries()) {
      const normalized = normalizeLegacyObject(entry);
      if (input.verifyFiles !== false) {
        const existing = await stat(resolveLegacyPath(input.rootDir, normalized.relativePath)).catch(() => null);
        if (!existing || existing.size !== normalized.size) {
          result.missingFiles.push({ sha256: normalized.sha256, relativePath: normalized.relativePath });
          continue;
        }
      }
      const before = await repository.getBySha256(normalized.sha256);
      const object = await repository.upsertObject({ objectId: `object:${normalized.sha256}`, sha256: normalized.sha256, mediaType: normalized.mediaType, byteCount: normalized.size, relativePath: normalized.relativePath, compression: null, encryption: null, createdAt: normalized.createdAt });
      if (before) result.skippedObjects += 1;
      else result.importedObjects += 1;
      const owner = ownerReference(input.projectId, normalized.owner);
      await repository.addReference({ referenceId: `reference:legacy:${normalized.sha256.slice(0, 24)}:${indexPosition}`, objectId: object.objectId, ownerKind: owner.ownerKind, ownerId: owner.ownerId, purpose: owner.purpose, createdAt: normalized.createdAt });
      result.importedReferences += 1;
    }
    return result;
  } finally {
    await repository.close();
  }
}

function parseLegacyIndex(content: string): AutomationStudioObjectIndex {
  const parsed = JSON.parse(content) as Partial<AutomationStudioObjectIndex>;
  return parsed.schemaVersion === "0.1" && Array.isArray(parsed.objects) ? { schemaVersion: "0.1", objects: parsed.objects } : { schemaVersion: "0.1", objects: [] };
}

function normalizeLegacyObject(entry: AutomationStudioObjectSummary): AutomationStudioObjectSummary {
  const sha256 = entry.sha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Legacy Automation Studio object digest is invalid.");
  const relativePath = entry.relativePath.trim().replaceAll(String.fromCharCode(92), "/");
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("..") || relativePath.includes(String.fromCharCode(0))) throw new Error("Legacy Automation Studio object path is invalid.");
  return { ...entry, sha256, relativePath, mediaType: entry.mediaType || "application/octet-stream", size: Math.max(0, Math.trunc(entry.size)), createdAt: Math.max(0, Math.trunc(entry.createdAt || Date.now())) };
}

function ownerReference(projectId: string, owner: AutomationStudioObjectOwner): { ownerKind: string; ownerId: string; purpose: string } {
  switch (owner.kind) {
    case "recording": return { ownerKind: "recording", ownerId: owner.recordingId, purpose: "legacy_object" };
    case "proposal": return { ownerKind: "proposal", ownerId: owner.proposalId, purpose: `legacy_recording:${owner.recordingId}` };
    case "project": return { ownerKind: "project", ownerId: projectId, purpose: "legacy_object" };
    case "shared": return { ownerKind: "project", ownerId: projectId, purpose: "shared_object" };
  }
}

function resolveLegacyPath(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Legacy Automation Studio object path escapes its storage root.");
  return target;
}

function safeSegment(value: string): string {
  const segment = value.trim();
  if (!segment || segment.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(segment)) throw new Error("Automation Studio project ID is invalid.");
  return segment;
}

