import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StateSnapshot } from "../model/index.ts";
import { AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectRuntimeStreamStore, type AutomationStudioRuntimeStreamEvent } from "./project-runtime-stream-store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-runtime-stream-store-test");

describe("AutomationStudioProjectRuntimeStreamStore", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("stores run summaries and one ordered runtime event stream without legacy JSONL rewrites", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool, "project.runtime", "flow.checkout");
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.runtime" });
    await store.putRunDetail({
      schemaVersion: "0.1",
      summary: runSummary({ actionAttemptCount: 2 }),
      routeDecisions: [{ decisionId: "route.1", routerId: "router.default", selectedRuleId: "rule.a", decidedAt: 20 }],
      subflows: [{ entryId: "subflow.1", subflowId: "subflow.checkout", enteredAt: 30, status: "succeeded" }],
      actionAttempts: [action("attempt.1", 1, 40), action("attempt.2", 2, 50)],
      recoveryAttempts: [{ recoveryId: "recovery.1", attemptId: "attempt.2", nodeId: "node.2", candidateCount: 1, status: "selected", createdAt: 55 }],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    });

    await expect(store.listRunSummaries({ flowId: "flow.checkout", limit: 10, offset: 0 })).resolves.toMatchObject({ total: 1, runs: [{ runId: "run.checkout", actionAttemptCount: 2 }] });
    await expect(store.listRuntimeEvents({ runId: "run.checkout", afterSequence: 0, limit: 3 })).resolves.toMatchObject({ events: [{ eventKind: "run_summary" }, { eventKind: "route_decision" }, { eventKind: "subflow_execution" }], hasMore: true, lastSequence: 3 });
    await expect(store.listRunActions({ runId: "run.checkout", limit: 1, offset: 1 })).resolves.toMatchObject({ total: 2, actions: [{ attemptId: "attempt.2" }] });
    await expect(readFile(path.join(rootDir, "projects", "project.runtime", "runtime", "runs", "run.checkout", "actions.jsonl"), "utf8")).rejects.toThrow();
    await store.close();
    await pool.closeAll();
  });

  it("lists run summaries from SQL metadata without reading event chunk payloads", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool, "project.runtime", "flow.checkout");
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.runtime" });
    await store.putRunDetail({
      schemaVersion: "0.1",
      summary: runSummary({ actionAttemptCount: 3, updatedAt: 123 }),
      routeDecisions: [{ decisionId: "route.1", routerId: "router.default", selectedRuleId: "rule.a", decidedAt: 20 }],
      subflows: [],
      actionAttempts: [action("attempt.1", 1, 40), action("attempt.2", 2, 50), action("attempt.3", 3, 60)],
      recoveryAttempts: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    });

    await rm(path.join(rootDir, "projects", "project.runtime", "objects"), { recursive: true, force: true });

    await expect(store.listRunSummaries({ flowId: "flow.checkout", limit: 10, offset: 0 })).resolves.toMatchObject({
      total: 1,
      runs: [{ runId: "run.checkout", actionAttemptCount: 3 }]
    });
    await store.close();
    await pool.closeAll();
  });
  it("stores recording summaries and recording timelines as chunk streams", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedProject(pool, "project.recording");
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.recording" });
    await store.putRecording({
      schemaVersion: "0.1",
      recordingId: "recording.checkout",
      taskId: "task.checkout",
      startedAt: 10,
      endedAt: 100,
      environment: { id: "browser", label: "Browser", kind: "browser" },
      sources: [],
      actionChannels: [],
      initialState: emptyState(10),
      timeline: [
        { id: "entry.1", sequence: 1, timestamp: 20, type: "observation", sourceId: "client", observationType: "client.state_snapshot", payload: {} } as any,
        { id: "entry.2", sequence: 2, timestamp: 30, type: "action", sourceId: "client", actionType: "click", payload: {} } as any
      ],
      notes: [],
      metadata: { name: "Checkout recording", domainId: "web" }
    });

    await expect(store.listRecordingSummaries({ limit: 10, offset: 0 })).resolves.toMatchObject({ total: 1, recordings: [{ recordingId: "recording.checkout", metadata: { summaryOnly: true, eventCount: 2, actionCount: 1 } }] });
    await expect(store.listRecordingEvents({ recordingId: "recording.checkout", afterSequence: 1, limit: 1 })).resolves.toMatchObject({ events: [{ sequence: 2, id: "entry.2" }], hasMore: false });
    await store.close();
    await pool.closeAll();
  });

  it("stores state bodies as objects and path metadata in SQL", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedProject(pool, "project.state");
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.state" });
    const snapshot = stateWithValues("state.checkout", 42);
    const record = await store.putStateSnapshot({ sourceKind: "recording", sourceId: "recording.checkout", sequence: 7, snapshot, metadata: { phase: "before_action" } });

    await expect(store.listStatePaths({ snapshotId: record.snapshotId, namespace: "app", path: "cart.total" })).resolves.toMatchObject([{ valueType: "number", scalarNumber: 25 }]);
    const loaded = await store.getStateSnapshot({ snapshotId: record.snapshotId, includeState: true });
    expect(loaded?.state).toMatchObject({ id: "state.checkout", namespaces: { app: { values: { "cart.total": { value: 25 } } } } });
    await store.close();
    await pool.closeAll();
  });

  it("tails and reconnects runtime streams by sequence at a million events", { timeout: 60_000 }, async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool, "project.million", "flow.checkout");
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.million" });
    await store.upsertRunSummary(runSummary({ runId: "run.million", actionAttemptCount: 0, updatedAt: 1 }));

    for (let batch = 0; batch < 100; batch += 1) {
      const base = batch * 10_000;
      await store.appendRuntimeEvents({ runId: "run.million", maxEvents: 10_000, events: Array.from({ length: 10_000 }, (_, index) => event(base + index + 1)) });
    }

    const tail = await store.listRuntimeEvents({ runId: "run.million", afterSequence: 999_990, limit: 5 });
    expect(tail.events.map((item) => item.sequence)).toEqual([999_991, 999_992, 999_993, 999_994, 999_995]);
    const reconnect = await store.listRuntimeEvents({ runId: "run.million", afterSequence: tail.lastSequence, limit: 5 });
    expect(reconnect.events.map((item) => item.sequence)).toEqual([999_996, 999_997, 999_998, 999_999, 1_000_000]);
    await expect(store.listRunSummaries({ search: "million", limit: 1, offset: 0 })).resolves.toMatchObject({ runs: [{ runId: "run.million", actionAttemptCount: 1_000_000 }] });
    await store.close();
    await pool.closeAll();
  });
});

async function seedProject(pool: AutomationStudioProjectDatabasePool, projectId: string): Promise<void> {
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId });
  await admin.close();
}

async function seedFlow(pool: AutomationStudioProjectDatabasePool, projectId: string, flowId: string): Promise<void> {
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId });
  const lease = await pool.acquire(projectId);
  await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)", [flowId]);
  await lease.release();
  await admin.close();
}

function runSummary(input: { runId?: string; actionAttemptCount: number; updatedAt?: number }): any {
  return { schemaVersion: "0.1", runId: input.runId ?? "run.checkout", flowId: "flow.checkout", projectId: "project.runtime", status: "succeeded", startedAt: 10, finishedAt: 100, updatedAt: input.updatedAt ?? 100, routeDecisionCount: 1, subflowEntryCount: 1, actionAttemptCount: input.actionAttemptCount, interventionCount: 0, adaptationCount: 0 };
}

function action(attemptId: string, order: number, startedAt: number): any {
  return { attemptId, nodeId: `node.${order}`, definitionId: "action.click", order, status: "succeeded", startedAt, finishedAt: startedAt + 5, durationMs: 5 };
}

function event(index: number): Omit<AutomationStudioRuntimeStreamEvent, "sequence"> {
  return { eventId: `event.${index}`, eventKind: "action_attempt", timestampMs: index, title: `Node ${index}`, status: "succeeded", entityId: `attempt.${index}`, payload: action(`attempt.${index}`, index, index) };
}

function emptyState(timestamp: number): StateSnapshot {
  return { timestamp, namespaces: {} };
}

function stateWithValues(id: string, timestamp: number): StateSnapshot {
  return {
    id,
    timestamp,
    namespaces: {
      app: {
        schemaId: "app.state",
        schemaVersion: "1",
        values: {
          "cart.total": { type: "number", value: 25, observedAt: timestamp },
          "checkout.ready": { type: "boolean", value: true, observedAt: timestamp }
        }
      }
    }
  };
}
