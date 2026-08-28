import { mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";

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

