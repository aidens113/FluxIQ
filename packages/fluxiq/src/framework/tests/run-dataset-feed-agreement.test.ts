// @fluxiq-test-group real-sql
// The answer-first feed (t993) and the run dataset's end-of-run answer (t998) read a captured tag an item does not show
// alike: both "not shown", on the same rows, under the feed's own bound declaration. Its subjects are the feed
// (`automation-service/.../result-feed/`) and the store (`persistence/.../run-dataset-store.ts`), so it sits here.
// A lending library's shelf; nothing here mirrors a Lab scenario.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, storedAutomationStudioRecordSchema, validateAutomationStudioRecords, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstResultFeed } from "../automation-service/service/answer-first/result-feed/index.ts";
import { automationStudioAnswerFirstTaskProcessing } from "../automation-service/service/answer-first/result-processing/index.ts";
import { AutomationStudioProjectAdministration, AutomationStudioProjectDatabasePool, AutomationStudioProjectRunDatasetStore, AutomationStudioProjectRuntimeStreamStore } from "../persistence/automation/project/index.ts";

const PROJECT = "project.agreement";
const REFERENCE = Date.UTC(2030, 0, 10, 12);
const SCHEMA: AutomationStudioRecordSchema = { schemaVersion: "0.1", primaryKey: ["id"], fields: [
  { id: "id", label: "Id", valueType: "string", semanticType: "id" },
  { id: "title", label: "Title", valueType: "string", required: true },
  { id: "tag", label: "Tag", valueType: "string" }
] };
const SHELF: JsonObject[] = [{ id: "a", title: "Atlas", tag: "Renewable" }, { id: "b", title: "Birds" }, { id: "c", title: "Clocks", tag: "" }, { id: "d", title: "Dunes", tag: "Renewable online" }];
let root = "";
let pool: AutomationStudioProjectDatabasePool;
let store: AutomationStudioProjectRunDatasetStore;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-feed-agreement-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  const lease = await pool.acquire(PROJECT);
  try { await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow', 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)"); }
  finally { await lease.release(); }
  const runtime = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
  try { await runtime.upsertRunSummary({ schemaVersion: "0.1", runId: "run", flowId: "flow", projectId: PROJECT, status: "succeeded", startedAt: REFERENCE, finishedAt: REFERENCE + 50, updatedAt: REFERENCE + 50, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0, metadata: { processingReferenceTimeMs: REFERENCE, explorationAttempt: { attemptId: "attempt" } } }); }
  finally { await runtime.close(); }
  await admin.close();
  store = await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
});
afterEach(async () => {
  await store.close();
  await pool.closeAll();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

it("gives the same answer rows from the feed and from the store for a captured tag some items do not show", async () => {
  const instructionText = "List the loans that are renewable.";
  const processing = automationStudioAnswerFirstTaskProcessing({ instructionText, declared: { process: { where: [{ field: "Tag", contains: "Renewable" }], columns: ["Title"] } }, kept: undefined, legacy: false })!;
  const feed = automationStudioAnswerFirstResultFeed({ instructionText, readRowsKey: "read.extracted", processing, processingReferenceTimeMs: REFERENCE });
  const checked = validateAutomationStudioRecords(SHELF, SCHEMA, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
  const fields = Object.fromEntries(SCHEMA.fields.map((field) => [field.id, `.${field.id}`]));
  const value: JsonObject = { node: "fixture.read", parameters: { read: { fields } } };
  const step: AutomationStudioFlowDraftStep = { id: "shelf", callId: "shelf", position: 1, iteration: 1, disposition: "kept", proposes: true, effect: "observe", input: value, toolId: "core.run_node", actionId: "fixture.read" };
  const stored = storedAutomationStudioRecordSchema(SCHEMA);
  feed.expect({ kind: "add", position: 1, intermediate: false });
  feed.called({ callId: "shelf", toolId: "core.run_node", value }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: checked.rows, listKey: "fixture.shelf", place: "page=1" } } }, { rows: checked.rows, schema: stored, datasetId: "read.shelf", invalidCount: checked.invalidCount, truncated: checked.truncated });
  feed.draft([step]);
  expect(feed.readiness()).toEqual({ state: "ready" });
  const fromFeed = feed.rows().rows;
  expect(fromFeed.map((row) => row.title)).toEqual(["Atlas", "Dunes"]);

  // The store applies the feed's own bound declaration, as a saved Flow's later attempt does at its end.
  const process = feed.storedProcessing() as AutomationStudioRecordProcessing | undefined;
  expect(process?.declaration?.version).toBe(1);
  await store.appendBatch({ runId: "run", datasetId: "loans", nodeId: "read", attemptId: "shelf", batchKey: "shelf", schema: SCHEMA, schemaDigest: "sha256:shelf", writeMode: "append", rows: checked.rows, invalidCount: checked.invalidCount, truncated: checked.truncated, process: process!, now: REFERENCE });
  await store.processRunDatasets("run");
  const fromStore = (await store.getPage({ runId: "run", datasetId: "loans", retained: "answer" }))?.rows;
  expect(fromStore).toEqual(fromFeed);
});
