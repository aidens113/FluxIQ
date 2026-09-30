// A run-detail save reads the run's event stream once. The writer reads the
// stored detail with `readRunForUpdate` and hands the stream it read to
// `putRunDetail`, which used to read the whole stream again. These hold that
// the reused stream writes exactly what a fresh read would have written.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { AutomationStudioProjectAdministration } from "../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../runtime-stream-store.ts";

const PROJECT = "project.runtime";
const FLOW = "flow.checkout";
let rootDir = "";
let pool: AutomationStudioProjectDatabasePool;

describe("a run-detail save that reuses the stream it read", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-runtime-stream-store-update-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
    const lease = await pool.acquire(PROJECT);
    await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)", [FLOW]);
    await lease.release();
    await admin.close();
  });

  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("writes the same events and reads back the same detail as a save that reads the stream again", async () => {
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
    try {
      for (const runId of ["run.reused", "run.reread"]) await store.putRunDetail(detail(runId, 2, 100));

      const read = await store.readRunForUpdate("run.reused");
      expect(read.detail).toEqual(await store.getRunDetail("run.reused"));
      await store.putRunDetail(detail("run.reused", 3, 200), { existingEvents: read.events! });
      await store.putRunDetail(detail("run.reread", 3, 200));

      const kinds = async (runId: string) => (await store.listRuntimeEvents({ runId, afterSequence: 0, limit: 100 })).events.map((event) => [event.eventKind, event.sequence]);
      expect(await kinds("run.reused")).toEqual(await kinds("run.reread"));
      const reused = await store.getRunDetail("run.reused");
      const reread = await store.getRunDetail("run.reread");
      expect(reused?.actionAttempts?.map((attempt) => attempt.attemptId)).toEqual(["attempt.1", "attempt.2", "attempt.3"]);
      expect(JSON.stringify(reused).replaceAll("run.reused", "run.x")).toEqual(JSON.stringify(reread).replaceAll("run.reread", "run.x"));
    } finally {
      await store.close();
    }
  });

  it("reads no stream for a run it does not hold", async () => {
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
    try {
      await expect(store.readRunForUpdate("run.absent")).resolves.toEqual({ detail: null, events: null });
    } finally {
      await store.close();
    }
  });
});

function detail(runId: string, actions: number, updatedAt: number): AutomationStudioFlowRunDetail {
  const actionAttempts = Array.from({ length: actions }, (_, index) => ({ attemptId: `attempt.${index + 1}`, nodeId: `node.${index + 1}`, definitionId: "action.click", order: index + 1, status: "succeeded", startedAt: 40 + index * 10, finishedAt: 45 + index * 10, durationMs: 5 }));
  return {
    schemaVersion: "0.1",
    summary: { schemaVersion: "0.1", runId, flowId: FLOW, projectId: PROJECT, status: "succeeded", startedAt: 10, finishedAt: updatedAt, updatedAt, routeDecisionCount: 1, subflowEntryCount: 0, actionAttemptCount: actions, interventionCount: 0, adaptationCount: 0 },
    routeDecisions: [{ decisionId: "route.1", routerId: "router.default", selectedRuleId: "rule.a", decidedAt: 20 }],
    subflows: [],
    actionAttempts,
    recoveryAttempts: [],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  } as unknown as AutomationStudioFlowRunDetail;
}
