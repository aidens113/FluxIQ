import { expect, it } from "vitest";
import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import type { AutomationStudioResultEvidenceBundle } from "../../../../../../runtime/result-verification/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_COPIED_ROW_NODE_ID, automationStudioAnswerFirstCopyRows } from "../../rows/index.ts";
import { automationStudioAnswerFirstRestoreResult, automationStudioAnswerFirstResultFeed } from "../index.ts";
import { automaticFeed, REFERENCE, SCHEMA } from "./automatic-support.ts";
import { reread } from "./source-validation-support.ts";

const rows = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
const schema = { ...SCHEMA, fields: SCHEMA.fields.filter((field) => field.handling !== "exclude") };
const summary = (datasetId: string, invalidCount = 0): AutomationStudioRunDatasetSummary => ({ runId: "previous", datasetId, nodeIds: [], schemaDigest: "actual-schema", recordCount: rows.length, truncated: false, invalidCount, updatedAt: 1 });

function namedCollection() {
  const setup = automaticFeed({ columns: ["title"] });
  const step = setup.read("reader", [rows[0]!]);
  const feed = () => automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: setup.processing, processingReferenceTimeMs: REFERENCE });
  const current = feed();
  const batches: AutomationStudioRecordBatch[] = rows.map((row, index) => ({ nodeId: "reader", attemptId: "actual", batchKey: `browser.${index + 1}`, datasetId: "shared", writeMode: "append", schema, rows: [row], invalidCount: 0, truncated: false, place: `page=${index + 1}`, listKey: "fixture.records" }));
  current.batches(batches.map((batch) => ({ batch, step })));
  current.draft([step]);
  const sources = new Map([['shared', { schema, rows }]]);
  const restore = (evidence: AutomationStudioResultEvidenceBundle, stored = batches) => automationStudioAnswerFirstRestoreResult({ evidence, steps: [step], batches: stored, source: (id) => sources.get(id) });
  return { step, feed, current, batches, sources, restore };
}

async function copy(runId: string, datasetId: string, sourceRows = rows, invalidCount = 0) {
  const copied: AutomationStudioRecordBatch[] = [];
  expect(await automationStudioAnswerFirstCopyRows({ shown: undefined, sink: { recordBatch: async (batch) => { copied.push(batch); return summary(datasetId, invalidCount); } }, stored: { runId, list: async () => [summary(datasetId, invalidCount)], page: async () => ({ summary: summary(datasetId, invalidCount), schema, rows: sourceRows, nextCursor: null }) } })).toEqual({ ok: true, rows: sourceRows.length });
  return copied;
}

it("retains actual named-dataset provenance through two checkpoint/copy/reopen cycles with different storage keys", async () => {
  const p = namedCollection();
  let evidence = p.current.evidence();
  let previousKeys = p.batches.map((batch) => batch.batchKey);
  for (const runId of ["first-segment", "second-segment"]) {
    const copied = await copy(runId, "shared");
    expect(copied.map((batch) => batch.batchKey)).not.toEqual(previousKeys);
    expect(copied.every((batch) => !evidence.pages.some((page) => page.source === batch.batchKey))).toBe(true);
    const restored = p.restore(JSON.parse(JSON.stringify(evidence)), copied);
    if (!restored.ok) throw new Error(restored.reason);
    const reopened = p.feed(); reopened.restored(restored.entries);
    expect(reopened.readiness()).toEqual({ state: "ready" });
    expect(reopened.rows().rows).toEqual(rows);
    evidence = reopened.evidence();
    expect(evidence.pages.map((page) => [page.source, page.datasetId])).toEqual([["browser.1", "shared"], ["browser.2", "shared"]]);
    previousKeys = copied.map((batch) => batch.batchKey);
  }
});

it("rejects contradictory original-batch validation counts and dataset associations", () => {
  const p = namedCollection();
  const evidence = p.current.evidence();
  const count = p.restore(evidence, [{ ...p.batches[0]!, invalidCount: 1 }, p.batches[1]!]);
  expect(count).toMatchObject({ ok: false, reason: expect.stringContaining("contradicts its exact original batch") });
  expect(count.entries.some((entry) => entry.read.source === "browser.1")).toBe(false);
  const association = p.restore(evidence, [{ ...p.batches[0]!, datasetId: "stale-other-dataset" }, p.batches[1]!]);
  expect(association).toMatchObject({ ok: false, reason: expect.stringContaining("conflicting stored dataset identity") });
  expect(association.entries.some((entry) => entry.read.source === "browser.1")).toBe(false);
});

it("does not use copied storage chunk collisions or missing producer identity to manufacture original count zero", () => {
  const p = namedCollection();
  const evidence = p.current.evidence();
  const unknown = { ...evidence, pages: evidence.pages.map(({ invalidCount: _count, ...page }) => page) };
  for (const nodeId of [AUTOMATION_STUDIO_ANSWER_FIRST_COPIED_ROW_NODE_ID, undefined]) {
    const stored = p.batches.map(({ nodeId: _producer, ...batch }) => ({ ...batch, ...(nodeId === undefined ? {} : { nodeId }) }));
    const restored = automationStudioAnswerFirstRestoreResult({ evidence: unknown, steps: [p.step], batches: stored, source: (id) => p.sources.get(id) });
    expect(restored).toMatchObject({ ok: false, reason: expect.stringContaining("per-source validation is unavailable") });
    expect(restored.entries.every((entry) => entry.read.invalidCount === undefined)).toBe(true);
    if (restored.ok) throw new Error("Copied/unknown producer cannot prove original validation");
    expect(restored.evidence?.missingEvidence).toContainEqual({ datasetId: "shared" });
  }
  const exact = p.restore(unknown);
  expect(exact.ok).toBe(true);
  expect(exact.entries.every((entry) => entry.read.invalidCount === 0)).toBe(true);
});

it.each([1, undefined])("holds unrepresented dataset validation (%s) even when every present original page has an exact zero count", (invalidCount) => {
  const p = namedCollection();
  const stored = [...p.batches, { ...p.batches[0]!, batchKey: "unrepresented-original", invalidCount }];
  const restored = automationStudioAnswerFirstRestoreResult({ evidence: p.current.evidence(), steps: [p.step], batches: stored, source: (id) => p.sources.get(id) });
  expect(restored.ok).toBe(false);
  expect(restored.entries).toHaveLength(2);
  if (restored.ok) throw new Error("Unrepresented original provenance must remain missing");
  expect(restored.evidence?.missingEvidence).toContainEqual({ datasetId: "shared" });
});

it("keeps dataset-wide rejection uncertainty after an exact first-page reread and another copy/reopen", async () => {
  const p = namedCollection();
  const restored = p.restore(p.current.evidence(), [...p.batches, { ...p.batches[0]!, batchKey: "unrepresented-original", invalidCount: 1 }]);
  if (restored.ok) throw new Error("Unrepresented rejected source must remain missing");
  const reopened = p.feed(); reopened.restored(restored.entries); reopened.sourceUnavailable(restored.reason, restored.evidence);
  reread(reopened, p.step, "fresh-one", [rows[0]!], SCHEMA, "page=1");
  const checkpoint = JSON.parse(JSON.stringify(reopened.evidence()));
  expect(checkpoint.pages[0]).toMatchObject({ source: "fresh-one", datasetId: "read.fresh-one", invalidCount: 0 });
  expect(checkpoint.pages[1]).toMatchObject({ source: "browser.2", datasetId: "shared" });
  expect(checkpoint.missingEvidence).toContainEqual({ datasetId: "shared" });
  p.sources.set("read.fresh-one", { schema, rows: [rows[0]!] });
  const copied = [...await copy("carried-next", "shared", rows, 1), ...await copy("carried-next", "read.fresh-one", [rows[0]!])];
  const again = p.restore(checkpoint, copied);
  expect(again.ok).toBe(false);
  expect(again.entries.map((entry) => entry.datasetId)).toEqual(["read.fresh-one", "shared"]);
  if (again.ok) throw new Error("One page cannot settle a whole-dataset requirement");
  const second = p.feed(); second.restored(again.entries); second.sourceUnavailable(again.reason, again.evidence);
  expect(second.readiness().state).toBe("missing-evidence");
  expect(second.rows().datasetId).toBeUndefined();
  expect(second.evidence().missingEvidence).toContainEqual({ datasetId: "shared" });
  const stale = p.restore(checkpoint, [{ ...p.batches[0]!, batchKey: "fresh-one" }, ...copied]);
  expect(stale).toMatchObject({ ok: false, reason: expect.stringContaining("conflicting stored dataset identity") });
});
