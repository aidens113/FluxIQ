import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { migrateAutomationStudioLegacyObjectIndex } from "./project-object-index-migration.ts";
import { AutomationStudioProjectObjectRepository } from "./project-object-repository.ts";

const shaOne = "a".repeat(64);
const shaTwo = "b".repeat(64);

describe("migrateAutomationStudioLegacyObjectIndex", () => {
  let rootDir: string;
  let pool: AutomationStudioProjectDatabasePool;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-object-index-migration-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("imports legacy objects.json metadata into SQL without moving bytes", async () => {
    const projectId = "project.legacy-objects";
    const objectPath = path.join("projects", projectId, "objects", "shared", `${shaOne}.json`);
    await mkdir(path.dirname(path.join(rootDir, objectPath)), { recursive: true });
    await writeFile(path.join(rootDir, objectPath), "hello");
    const before = await stat(path.join(rootDir, objectPath));
    await writeLegacyIndex(rootDir, projectId, [{ sha256: shaOne, mediaType: "application/json", size: 5, owner: { kind: "project" }, relativePath: objectPath.replaceAll(path.sep, "/"), createdAt: 1 }]);

    await expect(migrateAutomationStudioLegacyObjectIndex({ rootDir, pool, projectId })).resolves.toEqual({ importedObjects: 1, importedReferences: 1, skippedObjects: 0, missingFiles: [] });
    const after = await stat(path.join(rootDir, objectPath));
    expect(after.mtimeMs).toBe(before.mtimeMs);
    await expect(readFile(path.join(rootDir, objectPath), "utf8")).resolves.toBe("hello");
    const repository = await AutomationStudioProjectObjectRepository.open({ pool, projectId });
    await expect(repository.getBySha256(shaOne)).resolves.toMatchObject({ relativePath: objectPath.replaceAll(path.sep, "/") });
    await expect(repository.listReferencesByOwner({ ownerKind: "project", ownerId: projectId })).resolves.toMatchObject([{ purpose: "legacy_object" }]);
    await repository.close();
  });

  it("reports missing legacy object bytes and resumes without duplicating object rows", async () => {
    const projectId = "project.legacy-missing";
    const presentPath = path.join("projects", projectId, "objects", "shared", `${shaOne}.txt`);
    const missingPath = path.join("projects", projectId, "objects", "shared", `${shaTwo}.txt`);
    await mkdir(path.dirname(path.join(rootDir, presentPath)), { recursive: true });
    await writeFile(path.join(rootDir, presentPath), "one");
    await writeLegacyIndex(rootDir, projectId, [
      { sha256: shaOne, mediaType: "text/plain", size: 3, owner: { kind: "recording", recordingId: "recording.1" }, relativePath: presentPath.replaceAll(path.sep, "/"), createdAt: 1 },
      { sha256: shaTwo, mediaType: "text/plain", size: 3, owner: { kind: "shared" }, relativePath: missingPath.replaceAll(path.sep, "/"), createdAt: 2 }
    ]);
    await expect(migrateAutomationStudioLegacyObjectIndex({ rootDir, pool, projectId })).resolves.toMatchObject({ importedObjects: 1, importedReferences: 1, missingFiles: [{ sha256: shaTwo }] });
    await expect(migrateAutomationStudioLegacyObjectIndex({ rootDir, pool, projectId })).resolves.toMatchObject({ importedObjects: 0, skippedObjects: 1, importedReferences: 1, missingFiles: [{ sha256: shaTwo }] });
    const repository = await AutomationStudioProjectObjectRepository.open({ pool, projectId });
    await expect(repository.listReferencesByOwner({ ownerKind: "recording", ownerId: "recording.1" })).resolves.toMatchObject([{ purpose: "legacy_object" }]);
    await repository.close();
  });
});

async function writeLegacyIndex(rootDir: string, projectId: string, objects: unknown[]): Promise<void> {
  const indexPath = path.join(rootDir, "projects", projectId, "indexes", "objects.json");
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify({ schemaVersion: "0.1", objects }, null, 2));
}

