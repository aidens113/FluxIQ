import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectEventChunkStore } from "./project-event-chunk-store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-object-stream-edge-cases-test");

describe("Automation Studio object and stream edge cases", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("dedupes concurrent writes of identical content", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.concurrent-dedupe" });
    const writes = await Promise.all(Array.from({ length: 8 }, (_, index) => store.putBytes({ content: Buffer.from("same bytes"), mediaType: "text/plain", extension: "txt", transactionId: `tx.${index}` })));
    expect(new Set(writes.map((write) => write.object.objectId)).size).toBe(1);
    expect(new Set(writes.map((write) => write.object.sha256)).size).toBe(1);
    await store.close();
    await pool.closeAll();
  });

  it("detects corrupted content-addressed files before returning bytes", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.corrupt-object" });
    const write = await store.putBytes({ content: Buffer.from("original"), mediaType: "text/plain", extension: "txt" });
    await writeFile(write.contentPath, "corrupted");
    await expect(store.readBytesBySha256(write.object.sha256)).rejects.toThrow(/digest mismatch/);
    await store.close();
    await pool.closeAll();
  });

  it("reads deep event pages without offset pagination", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedRuntime(pool, "project.deep-events", "flow.1", "run.1");
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.deep-events" });
    for (let chunkIndex = 0; chunkIndex < 60; chunkIndex += 1) {
      const first = chunkIndex * 2 + 1;
      await chunks.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: first, timestampMs: first }, { sequence: first + 1, timestampMs: first + 1 }], createdAt: chunkIndex + 1 });
    }
    const page = await chunks.readEventsBySequence({ streamKind: "runtime", streamId: "run.1", afterSequence: 100, limit: 5 });
    expect(page.events.map((event) => event.sequence)).toEqual([101, 102, 103, 104, 105]);
    expect(page.nextCursor).toBe("105");
    expect(page.hasMore).toBe(true);
    await chunks.close();
    await pool.closeAll();
  });
});

async function seedRuntime(pool: AutomationStudioProjectDatabasePool, projectId: string, flowId: string, runId: string): Promise<void> {
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId });
  const lease = await pool.acquire(projectId);
  await lease.database.transaction(async (sql) => {
    await sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)", [flowId]);
    await sql.run("insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, updated_at_ms) values (?, ?, 1, 'running', 'manual', 1, 1)", [runId, flowId]);
  });
  await lease.release();
  await admin.close();
}

