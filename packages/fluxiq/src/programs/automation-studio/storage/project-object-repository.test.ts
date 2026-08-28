import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectObjectRepository } from "./project-object-repository.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-object-repository-test");
const shaOne = "a".repeat(64);
const shaTwo = "b".repeat(64);
const shaThree = "c".repeat(64);

describe("AutomationStudioProjectObjectRepository", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("owns object metadata and references in project SQL instead of objects.json", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    let repository = await AutomationStudioProjectObjectRepository.open({ pool, projectId: "project.objects" });
    const object = await repository.upsertObject({ objectId: "object.1", sha256: shaOne, mediaType: "application/json", byteCount: 12, relativePath: "objects/aa/object.json", compression: null, encryption: null, createdAt: 1 });
    await repository.addReference({ referenceId: "reference.1", objectId: object.objectId, ownerKind: "runtime_run", ownerId: "run.1", purpose: "event_chunk", createdAt: 2 });
    await repository.close();

    repository = await AutomationStudioProjectObjectRepository.open({ pool, projectId: "project.objects" });
    await expect(repository.getBySha256(shaOne)).resolves.toMatchObject({ objectId: "object.1", relativePath: "objects/aa/object.json" });
    await expect(repository.listReferencesByOwner({ ownerKind: "runtime_run", ownerId: "run.1" })).resolves.toMatchObject([{ objectId: "object.1", purpose: "event_chunk" }]);
    await expect(readFile(path.join(rootDir, "projects", "project.objects", "indexes", "objects.json"), "utf8")).rejects.toThrow();
    await repository.close();
    await pool.closeAll();
  });

  it("dedupes object rows by sha256 and paginates without offsets", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectObjectRepository.open({ pool, projectId: "project.object-pages" });
    await repository.upsertObject({ objectId: "object.1", sha256: shaOne, mediaType: "application/json", byteCount: 1, relativePath: "objects/1.json", compression: null, encryption: null, createdAt: 1 });
    await repository.upsertObject({ objectId: "object.duplicate", sha256: shaOne, mediaType: "application/json", byteCount: 1, relativePath: "objects/duplicate.json", compression: null, encryption: null, createdAt: 2 });
    await repository.upsertObject({ objectId: "object.2", sha256: shaTwo, mediaType: "image/png", byteCount: 2, relativePath: "objects/2.png", compression: null, encryption: null, createdAt: 2 });
    await repository.upsertObject({ objectId: "object.3", sha256: shaThree, mediaType: "image/png", byteCount: 3, relativePath: "objects/3.png", compression: null, encryption: null, createdAt: 3 });
    const first = await repository.listObjects({ limit: 2 });
    const second = await repository.listObjects({ limit: 2, cursor: first.nextCursor });
    expect([...first.items, ...second.items].map((item) => item.objectId)).toEqual(["object.3", "object.2", "object.1"]);
    await repository.close();
    await pool.closeAll();
  });

  it("lists unreferenced objects after references are removed", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectObjectRepository.open({ pool, projectId: "project.unreferenced" });
    await repository.upsertObject({ objectId: "object.keep", sha256: shaOne, mediaType: "application/json", byteCount: 1, relativePath: "objects/keep.json", compression: null, encryption: null, createdAt: 1 });
    await repository.upsertObject({ objectId: "object.collect", sha256: shaTwo, mediaType: "application/json", byteCount: 1, relativePath: "objects/collect.json", compression: null, encryption: null, createdAt: 2 });
    await repository.addReference({ referenceId: "reference.keep", objectId: "object.keep", ownerKind: "flow", ownerId: "flow.1", purpose: "settings", createdAt: 3 });
    await repository.addReference({ referenceId: "reference.collect", objectId: "object.collect", ownerKind: "flow", ownerId: "flow.1", purpose: "draft", createdAt: 4 });
    await expect(repository.deleteReference("reference.collect")).resolves.toBe(true);
    await expect(repository.listUnreferencedObjects()).resolves.toMatchObject([{ objectId: "object.collect" }]);
    await repository.close();
    await pool.closeAll();
  });
});

