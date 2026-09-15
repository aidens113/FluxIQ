import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail, StateSnapshot } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../../../runtime/executor/index.ts";
import { AutomationStudioProjectAdministration } from "../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectRunDatasetStore, type AutomationStudioRunDatasetBatch } from "../run-dataset-store.ts";
import { AutomationStudioProjectRuntimeStreamStore, type AutomationStudioRuntimeStreamEvent } from "../runtime-stream-store.ts";

// Sibling storage tests keep their scratch root under the working directory.
// This one writes about 158 MB, for the million-event stream case, so it goes
// to the OS temp directory instead: on a slow working-disk the case took 50 to
// 62 s against its 60 s budget, and on the OS disk it takes about a third of
// that. Everything the case proves is about sequence order, not disk location.
const rootDir = path.join(os.tmpdir(), "fluxiq-automation-studio-project-runtime-stream-store-test");

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

  it("pages scalar action summaries and loads action and event JSON only on demand", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool, "project.runtime", "flow.checkout");
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.runtime" });
    const detailedAction = {
      ...action("attempt.detail", 1, 40),
      route: "success",
      comparisonStatus: "matched",
      message: "Clicked the checkout button",
      effects: [{ kind: "dom", selector: "#checkout" }],
      evidence: [{ evidenceId: "evidence.one" }]
    };
    await store.putRunDetail({
      schemaVersion: "0.1",
      summary: runSummary({ actionAttemptCount: 2 }),
      routeDecisions: [],
      subflows: [],
      actionAttempts: [detailedAction, action("attempt.second", 2, 50)],
      recoveryAttempts: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    });

    const firstPage = await store.listRunActions({ runId: "run.checkout", limit: 1 });
    expect(firstPage).toMatchObject({ total: 2, hasMore: true, actions: [{ attemptId: "attempt.detail", definitionId: "action.click", route: "success", comparisonStatus: "matched", message: "Clicked the checkout button", durationMs: 5, metadata: { summaryOnly: true } }] });
    expect(firstPage.actions[0]).not.toHaveProperty("effects");
    expect(firstPage.actions[0]).not.toHaveProperty("evidence");
    const repairLease = await pool.acquire("project.runtime");
    await repairLease.database.run("update runtime_action_summaries set definition_id = 'unknown' where run_id = ? and attempt_id = ?", ["run.checkout", "attempt.detail"]);
    await repairLease.release();
    await expect(store.listRunActions({ runId: "run.checkout", limit: 1 })).resolves.toMatchObject({ actions: [{ attemptId: "attempt.detail", definitionId: "action.click" }] });
    await expect(store.listRunActions({ runId: "run.checkout", limit: 1, cursor: firstPage.nextCursor })).resolves.toMatchObject({ actions: [{ attemptId: "attempt.second", definitionId: "action.click" }], hasMore: false });
    await expect(store.getRunActionDetail({ runId: "run.checkout", attemptId: "attempt.detail" })).resolves.toMatchObject({ effects: [{ selector: "#checkout" }], evidence: [{ evidenceId: "evidence.one" }] });

    const events = await store.listRuntimeEvents({ runId: "run.checkout", afterSequence: 0, limit: 20, includePayload: false });
    const compactEvent = events.events.find((event) => event.entityId === "attempt.detail");
    expect(compactEvent).toBeDefined();
    expect(compactEvent).not.toHaveProperty("payload");
    await expect(store.getRuntimeEventDetail({ runId: "run.checkout", sequence: compactEvent!.sequence })).resolves.toMatchObject({ payload: { attemptId: "attempt.detail", effects: [{ selector: "#checkout" }] } });
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

  it("keeps each run input's key and withholds its value in the envelope a run-summary event persists", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool, "project.runtime", "flow.checkout");
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.runtime" });
    const withheldInputs = { "web.secret.password": AUTOMATION_STUDIO_WITHHELD_VALUE, retries: AUTOMATION_STUDIO_WITHHELD_VALUE };
    await store.putRunDetail({
      schemaVersion: "0.1",
      summary: runSummary({ actionAttemptCount: 0 }),
      inputs: { "web.secret.password": SUPPLIED_RUN_INPUT, retries: 3 },
      routeDecisions: [],
      subflows: [],
      actionAttempts: [],
      recoveryAttempts: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    });

    const page = await store.listRuntimeEvents({ runId: "run.checkout", afterSequence: 0, limit: 10, includePayload: true });
    expect(page.events.find((event) => event.eventKind === "run_summary")?.payload?.inputs).toEqual(withheldInputs);
    await expect(store.getRunDetail("run.checkout")).resolves.toMatchObject({ inputs: withheldInputs });
    await store.close();
    await pool.closeAll();
    expect(await filesHolding(rootDir, SUPPLIED_RUN_INPUT)).toEqual([]);
  });

  it("joins the run's dataset summaries into compact and full run detail, and writes no datasets for a run that stored none", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedFlow(pool, "project.runtime", "flow.checkout");
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.runtime" });
    await store.putRunDetail(emptyRunDetail("run.checkout"));
    // A detail handed to `putRunDetail` cannot plant datasets: they come from the dataset store alone.
    await store.putRunDetail({ ...emptyRunDetail("run.empty"), datasets: [datasetSummary({ runId: "run.empty", datasetId: "planted" })] });
    // Nor can a later run-summary event whose envelope carries a `datasets` key.
    await store.appendRuntimeEvents({ runId: "run.empty", events: [{ eventId: "run_summary:run.empty:planted", eventKind: "run_summary", timestampMs: 200, title: "Run summary", payload: { schemaVersion: "0.1", datasets: [{ runId: "run.empty", datasetId: "enveloped", nodeIds: ["planted"], schemaDigest: "sha256:planted", recordCount: 9, truncated: false, invalidCount: 0, updatedAt: 9 }] } }] });
    await expect(store.listRuntimeEvents({ runId: "run.empty", afterSequence: 0, limit: 10 })).resolves.toMatchObject({ events: [{ eventKind: "run_summary" }, { eventKind: "run_summary", payload: { datasets: [{ datasetId: "enveloped" }] } }] });
    const datasets = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: "project.runtime" });
    await datasets.appendBatch(datasetBatch({ datasetId: "listings", label: "Listings", nodeId: "extract", rows: [{ title: "First" }, { title: "Second" }], invalidCount: 1, now: 1_000 }));
    await datasets.appendBatch(datasetBatch({ datasetId: "prices", nodeId: "prices", rows: [{ title: "Only" }], invalidCount: 0, now: 2_000 }));

    // Most recently written first, every field named.
    const expected: AutomationStudioRunDatasetSummary[] = [
      { runId: "run.checkout", datasetId: "prices", nodeIds: ["prices"], schemaDigest: "sha256:listing-schema", recordCount: 1, truncated: false, invalidCount: 0, updatedAt: 2_000 },
      { runId: "run.checkout", datasetId: "listings", label: "Listings", nodeIds: ["extract"], schemaDigest: "sha256:listing-schema", recordCount: 2, truncated: false, invalidCount: 1, updatedAt: 1_000 }
    ];
    const compact = await store.getRunDetail("run.checkout", { includeCollections: false });
    expect(compact?.metadata).toMatchObject({ collectionsPaged: true });
    expect(compact?.datasets).toEqual(expected);
    const full = await store.getRunDetail("run.checkout");
    expect(full?.metadata).not.toHaveProperty("collectionsPaged");
    expect(full?.datasets).toEqual(expected);

    await expect(store.getRunDetail("run.empty", { includeCollections: false })).resolves.not.toHaveProperty("datasets");
    await expect(store.getRunDetail("run.empty")).resolves.not.toHaveProperty("datasets");
    await datasets.close();
    await store.close();
    await pool.closeAll();
  });
});

// Obviously synthetic: the assertion is that this string is absent from every
// byte the store wrote, so a realistic credential would itself be the leak.
const SUPPLIED_RUN_INPUT = "synthetic-run-input-that-must-never-be-persisted";

async function filesHolding(root: string, literal: string): Promise<string[]> {
  const needles = [Buffer.from(literal, "utf8"), Buffer.from(literal, "utf16le")];
  const holding: string[] = [];
  for (const file of await filesUnder(root)) {
    const bytes = await readFile(file);
    if (needles.some((needle) => bytes.includes(needle))) holding.push(path.relative(root, file));
  }
  return holding;
}

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

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

const LISTING_SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string", required: true }] };

function emptyRunDetail(runId: string): AutomationStudioFlowRunDetail {
  return { schemaVersion: "0.1", summary: runSummary({ runId, actionAttemptCount: 0 }), routeDecisions: [], subflows: [], actionAttempts: [], recoveryAttempts: [], interventions: [], adaptationIds: [], changeProposalIds: [] };
}

function datasetSummary(input: { runId: string; datasetId: string }): AutomationStudioRunDatasetSummary {
  return { runId: input.runId, datasetId: input.datasetId, nodeIds: ["planted"], schemaDigest: "sha256:planted", recordCount: 9, truncated: false, invalidCount: 0, updatedAt: 9 };
}

function datasetBatch(input: { datasetId: string; nodeId: string; label?: string; rows: Array<{ title: string }>; invalidCount: number; now: number }): AutomationStudioRunDatasetBatch {
  const attemptId = `${input.nodeId}.attempt.1`;
  // `batchKey` is being added to the store's batch type in a concurrent amendment;
  // the assertion keeps this literal valid on either side of that change.
  return { runId: "run.checkout", datasetId: input.datasetId, ...(input.label ? { label: input.label } : {}), nodeId: input.nodeId, attemptId, batchKey: attemptId, schema: LISTING_SCHEMA, schemaDigest: "sha256:listing-schema", writeMode: "append", rows: input.rows, invalidCount: input.invalidCount, truncated: false, now: input.now } as AutomationStudioRunDatasetBatch;
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
