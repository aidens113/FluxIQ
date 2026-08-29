import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectEventStreamStore } from "./project-event-stream-writer.ts";

let rootDir: string;
let pool: AutomationStudioProjectDatabasePool;

describe("AutomationStudioProjectEventStreamStore", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-event-stream-writer-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("allows one active writer per stream and seals a spool into an immutable chunk", async () => {
    await seedRuntime(pool, "project.stream", "flow.1", "run.1");
    const streams = await AutomationStudioProjectEventStreamStore.open({ pool, projectId: "project.stream" });
    const writer = await streams.acquireWriter({ streamKind: "runtime", streamId: "run.1", ownerId: "worker.1", leaseTtlMs: 5_000, now: 1 });
    await writer.append([{ sequence: 1, kind: "start" }, { sequence: 2, kind: "action" }]);
    await expect(streams.acquireWriter({ streamKind: "runtime", streamId: "run.1", ownerId: "worker.2", leaseTtlMs: 5_000, now: 2 })).rejects.toThrow(/active writer/);
    const chunk = await writer.seal();
    expect(chunk).toMatchObject({ streamKind: "runtime", streamId: "run.1", firstSequence: 1, lastSequence: 2, eventCount: 2 });
    await expect(streams.acquireWriter({ streamKind: "runtime", streamId: "run.1", ownerId: "worker.2", leaseTtlMs: 5_000, now: 3 })).resolves.toBeTruthy();
    await streams.close();
  });

  it("recovers expired active spools into chunks after a simulated crash", async () => {
    await seedRuntime(pool, "project.recover", "flow.1", "run.1");
    let streams = await AutomationStudioProjectEventStreamStore.open({ pool, projectId: "project.recover" });
    const writer = await streams.acquireWriter({ streamKind: "runtime", streamId: "run.1", ownerId: "worker.1", leaseTtlMs: 1_000, now: 1_000 });
    await writer.append([{ sequence: 1, kind: "start" }, { sequence: 2, kind: "action" }]);
    await writer.close({ releaseLease: false });
    await streams.close();

    streams = await AutomationStudioProjectEventStreamStore.open({ pool, projectId: "project.recover" });
    await expect(streams.recoverExpiredSpools({ now: 3_000 })).resolves.toMatchObject([{ firstSequence: 1, lastSequence: 2, eventCount: 2 }]);
    await streams.close();
  });

  it("enforces contiguous append sequences within the active spool", async () => {
    await seedRuntime(pool, "project.sequence", "flow.1", "run.1");
    const streams = await AutomationStudioProjectEventStreamStore.open({ pool, projectId: "project.sequence" });
    const writer = await streams.acquireWriter({ streamKind: "runtime", streamId: "run.1", ownerId: "worker.1", now: 1 });
    await writer.append([{ sequence: 10, kind: "start" }]);
    await expect(writer.append([{ sequence: 12, kind: "skip" }])).rejects.toThrow(/expected sequence 11/);
    await writer.close();
    await streams.close();
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

