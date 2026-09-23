import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunSummary } from "../../../model/index.ts";
import { AutomationStudioProjectAdministration } from "../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../runtime-stream-store.ts";

const rootDir = path.join(os.tmpdir(), "fluxiq-automation-studio-result-check-state-test");
const PROJECT = "project.checks";
const FLOW = "flow.catalogue";

describe("runtime_runs result check state", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("counts finished runs at an epoch, and the position and verdict of the newest check", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool);
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
    await write(store, [
      { runId: "run.1", finishedAt: 1_000, checked: "confirmed" },
      { runId: "run.2", finishedAt: 2_000, checked: "confirmed" },
      { runId: "run.3", finishedAt: 3_000, checked: "refuted" },
      { runId: "run.4", finishedAt: 4_000 },
      { runId: "run.5", finishedAt: 5_000 }
    ]);
    expect(await store.readResultCheckState({ flowId: FLOW, epoch: 1 })).toEqual({ ordinal: 5, lastCheckedOrdinal: 3, checksPassed: 2, lastStatus: "refuted" });
    await store.close();

  });

  it("reads an unchecked run as unchecked, never as unverified", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool);
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
    // The schedule passed over both, so each still ran the verification and was
    // recorded `unverified` on its own detail -- but neither was put to the
    // question, and the column has to say so.
    await write(store, [
      { runId: "run.1", finishedAt: 1_000, status: "unverified", checked: undefined },
      { runId: "run.2", finishedAt: 2_000, status: "unverified", checked: undefined }
    ]);
    expect(await store.readResultCheckState({ flowId: FLOW, epoch: 1 })).toEqual({ ordinal: 2, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null });
    await store.close();

  });

  it("restarts the count when the epoch advances, which is what a landed repair does", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool);
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
    await write(store, [
      { runId: "run.1", finishedAt: 1_000, checked: "confirmed" },
      { runId: "run.2", finishedAt: 2_000, checked: "confirmed" },
      { runId: "run.3", finishedAt: 3_000, checked: "refuted" }
    ]);
    // The repair lands: `flows.graph_revision` goes to 2, so every run after it
    // is written at epoch 2 and the three-run window opens again for free.
    await write(store, [{ runId: "run.4", finishedAt: 4_000, epoch: 2 }]);
    expect(await store.readResultCheckState({ flowId: FLOW, epoch: 2 })).toEqual({ ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null });
    expect(await store.readResultCheckState({ flowId: FLOW, epoch: 1 })).toMatchObject({ ordinal: 3, lastCheckedOrdinal: 3 });
    await store.close();

  });

  it("survives closing and reopening the database", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool);
    const first = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
    await write(first, [
      { runId: "run.1", finishedAt: 1_000, checked: "confirmed" },
      { runId: "run.2", finishedAt: 2_000 },
      { runId: "run.3", finishedAt: 3_000, checked: "unverified" }
    ]);
    await first.close();

    const reopened = new AutomationStudioProjectDatabasePool({ rootDir });
    const second = await AutomationStudioProjectRuntimeStreamStore.open({ pool: reopened, projectId: PROJECT });
    expect(await second.readResultCheckState({ flowId: FLOW, epoch: 1 })).toEqual({ ordinal: 3, lastCheckedOrdinal: 3, checksPassed: 1, lastStatus: "unverified" });
    await second.close();

  });

  it("gives two runs that finished in the same millisecond definite ordinals", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool);
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
    await write(store, [
      { runId: "run.a", finishedAt: 7_000 },
      { runId: "run.b", finishedAt: 7_000, checked: "confirmed" },
      { runId: "run.c", finishedAt: 7_000 }
    ]);
    expect(await store.readResultCheckState({ flowId: FLOW, epoch: 1 })).toMatchObject({ ordinal: 3, lastCheckedOrdinal: 2, checksPassed: 1 });
    await store.close();

  });

  it("counts a run that has not finished as no run at all", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool);
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
    await write(store, [{ runId: "run.1", finishedAt: 1_000, checked: "confirmed" }, { runId: "run.2", finishedAt: null }]);
    expect(await store.readResultCheckState({ flowId: FLOW, epoch: 1 })).toMatchObject({ ordinal: 1, lastCheckedOrdinal: 1 });
    await store.close();

  });
});

async function seedFlow(pool: AutomationStudioProjectDatabasePool): Promise<void> {
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  const lease = await pool.acquire(PROJECT);
  await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)", [FLOW]);
  await lease.release();
  await admin.close();
}

type WrittenRun = {
  runId: string;
  finishedAt: number | null;
  /** The verdict a check of this run reached. Absent means the schedule did not check it. */
  checked?: string | undefined;
  /** A status written without `checked`, to prove the column still reads null. */
  status?: string;
  epoch?: number;
};

async function write(store: AutomationStudioProjectRuntimeStreamStore, runs: WrittenRun[]): Promise<void> {
  for (const run of runs) {
    const resultCheck = {
      epoch: run.epoch ?? 1,
      ...(run.checked !== undefined ? { checked: true, status: run.checked } : {}),
      ...(run.status !== undefined ? { status: run.status } : {})
    };
    await store.upsertRunSummary({
      schemaVersion: "0.1",
      runId: run.runId,
      flowId: FLOW,
      projectId: PROJECT,
      status: "succeeded",
      startedAt: 10,
      ...(run.finishedAt !== null ? { finishedAt: run.finishedAt } : {}),
      updatedAt: run.finishedAt ?? 10,
      routeDecisionCount: 0,
      subflowEntryCount: 0,
      actionAttemptCount: 0,
      interventionCount: 0,
      adaptationCount: 0,
      metadata: { resultCheck }
    } satisfies AutomationStudioFlowRunSummary);
  }
}
