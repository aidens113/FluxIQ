import { mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectContentStore } from "../content-store.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../content-protection.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-content-store-test");

describe("AutomationStudioProjectContentStore", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("writes bytes through staging, moves to digest storage, and records SQL ownership", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.content" });
    const result = await store.putBytes({
      content: Buffer.from("hello"),
      mediaType: "text/plain",
      extension: "txt",
      transactionId: "tx.1",
      owner: { ownerKind: "runtime_run", ownerId: "run.1", purpose: "event_chunk" },
      createdAt: 1
    });
    expect(result.deduped).toBe(false);
    expect(result.object.relativePath).toContain("objects/sha256/");
    await expect(readFile(result.contentPath, "utf8")).resolves.toBe("hello");
    await expect(store.readBytesBySha256(result.object.sha256)).resolves.toMatchObject({ content: Buffer.from("hello"), byteCount: 5 });
    expect(result.reference).toMatchObject({ ownerKind: "runtime_run", ownerId: "run.1", purpose: "event_chunk" });
    await store.close();
    await pool.closeAll();
  });

  it("dedupes repeated content without rewriting the canonical object", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.dedupe" });
    const first = await store.putJson({ value: { same: true }, transactionId: "tx.first", createdAt: 1 });
    const before = await stat(first.contentPath);
    const second = await store.putJson({ value: { same: true }, transactionId: "tx.second", createdAt: 2 });
    const after = await stat(first.contentPath);
    expect(second.deduped).toBe(true);
    expect(second.object.objectId).toBe(first.object.objectId);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    await store.close();
    await pool.closeAll();
  });

  it("uses a stable bounded reference ID when readable ownership would exceed storage limits", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.long-reference" });
    const ownerId = `compiled:${"flow.long-subflow-graph.".repeat(5)}:2:compiled-plan.v1`;
    const first = await store.putJson({ value: { compiled: true }, owner: { ownerKind: "compiled_artifact", ownerId, purpose: "compiled_plan" }, createdAt: 1 });
    const second = await store.putJson({ value: { compiled: true }, owner: { ownerKind: "compiled_artifact", ownerId, purpose: "compiled_plan" }, createdAt: 2 });
    expect(first.reference?.referenceId).toMatch(/^reference:sha256:[a-f0-9]{64}$/);
    expect(first.reference?.referenceId.length).toBeLessThanOrEqual(200);
    expect(second.reference?.referenceId).toBe(first.reference?.referenceId);
    await store.close();
    await pool.closeAll();
  });

  it("protects bytes at rest and fails closed without the configured provider", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const protection = new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "test.key", key: Buffer.alloc(32, 9) }));
    const store = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.protected", protection });
    const result = await store.putBytes({ content: Buffer.from("private projection"), mediaType: "application/json", protect: true, createdAt: 1 });
    expect(result.object.encryption).toContain(protection.providerId);
    expect(await readFile(result.contentPath, "utf8")).not.toContain("private projection");
    await expect(store.readBytesByObjectId(result.object.objectId)).resolves.toMatchObject({ content: Buffer.from("private projection") });
    await store.close();
    const unconfigured = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.protected" });
    await expect(unconfigured.readBytesByObjectId(result.object.objectId)).rejects.toThrow("without its protection provider");
    await expect(unconfigured.putBytes({ content: Buffer.from("no"), mediaType: "text/plain", protect: true })).rejects.toThrow("requires a configured protection provider");
    await unconfigured.close(); await pool.closeAll();
  });

  it("cleans old interrupted staging directories without touching fresh staging", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.cleanup" });
    const oldDir = path.join(rootDir, "projects", "project.cleanup", "staging", "old.tx");
    const freshDir = path.join(rootDir, "projects", "project.cleanup", "staging", "fresh.tx");
    await mkdir(oldDir, { recursive: true });
    await mkdir(freshDir, { recursive: true });
    await writeFile(path.join(oldDir, "orphan.tmp"), "old");
    await writeFile(path.join(freshDir, "orphan.tmp"), "fresh");
    const oldTime = new Date(1_000);
    const freshTime = new Date(10_000);
    await utimes(oldDir, oldTime, oldTime);
    await utimes(freshDir, freshTime, freshTime);
    await expect(store.cleanupStaging({ olderThanMs: 5_000, now: 10_000 })).resolves.toMatchObject({ deleted: ["projects/project.cleanup/staging/old.tx"] });
    await expect(readFile(path.join(freshDir, "orphan.tmp"), "utf8")).resolves.toBe("fresh");
    await store.close();
    await pool.closeAll();
  });
});
