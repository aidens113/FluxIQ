import { expect, it } from "vitest";
import { automationStudioAnswerFirstRestoreResult, automationStudioAnswerFirstResultFeed, readAutomationStudioAnswerFirstResultEvidence } from "../index.ts";
import { automaticFeed, REFERENCE, SCHEMA } from "./automatic-support.ts";
import { reread } from "./source-validation-support.ts";

const schema = { ...SCHEMA, fields: SCHEMA.fields.map((field) => field.id === "promoted" ? { ...field, required: true } : field) };
const safe = { id: "a", title: "A", promoted: false };
const fixed = { id: "b", title: "B", promoted: false };

it("holds a valid subset when another original was schema-invalid, retaining exact source/count through checkpoint and reopen", () => {
  const p = automaticFeed({ where: [{ field: "promoted", equals: "false" }], columns: ["title"] });
  const step = p.read("original", [safe, { id: "b", title: "B" }], schema);
  expect(p.feed.rows()).toMatchObject({ rows: [], totalRows: 0 });
  expect(p.feed.rows().datasetId).toBeUndefined();
  expect(p.feed.readiness()).toMatchObject({ state: "missing-evidence", reason: expect.stringContaining("original rows rejected by schema") });
  const checkpoint = JSON.parse(JSON.stringify(p.feed.evidence()));
  expect(checkpoint.pages).toEqual([expect.objectContaining({ source: "original", invalidCount: 1, rows: [safe] })]);
  expect(readAutomationStudioAnswerFirstResultEvidence(checkpoint)).toEqual(checkpoint);
  const restored = automationStudioAnswerFirstRestoreResult({ evidence: checkpoint, steps: p.steps, batches: [], source: (id) => p.sources.get(id) });
  if (!restored.ok) throw new Error(restored.reason);
  const reopened = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE });
  reopened.restored(restored.entries);
  expect(reopened.readiness().state).toBe("missing-evidence");
  expect(reopened.evidence().pages[0]).toMatchObject({ invalidCount: 1, rows: [safe] });
  reread(reopened, step, "fixed", [safe, fixed], schema, "page=1");
  expect(reopened.readiness()).toEqual({ state: "ready" });
  expect(reopened.rows().rows).toEqual([safe, fixed]);
  expect(reopened.evidence().pages[0]).toMatchObject({ source: "fixed", invalidCount: 0, rows: [safe, fixed] });
});

it("does not let a new unrelated valid read clear an invalid-source requirement", () => {
  const p = automaticFeed({ columns: ["title"] });
  p.read("invalid", [safe, { title: "Rejected" }], schema);
  p.read("unrelated", [{ title: "Another collection" }], { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] });
  expect(p.feed.readiness()).toMatchObject({ state: "missing-evidence", reason: expect.stringContaining("invalid") });
  expect(p.feed.rows().datasetId).toBeUndefined();
  expect(p.feed.boundProcessing()).toBeUndefined();
});

it("does not reinterpret rejected originals as a legitimate minRows:0 empty source", () => {
  const p = automaticFeed({ minRows: 0, columns: ["title"] });
  p.read("rejected", [{ id: "b", title: "B" }], schema);
  expect(p.feed.readiness().state).toBe("missing-evidence");
  expect(p.feed.rows().datasetId).toBeUndefined();
  expect(p.feed.evidence().pages[0]).toMatchObject({ rows: [], kept: 0, invalidCount: 1 });
});

it("keeps absent legacy validation provenance unknown in automatic mode", () => {
  const p = automaticFeed({ columns: ["title"] });
  p.read("one", [safe]);
  const original = p.feed.evidence();
  const unknown = { ...original, pages: original.pages.map(({ invalidCount: _known, ...page }) => page) };
  const restored = automationStudioAnswerFirstRestoreResult({ evidence: unknown, steps: p.steps, batches: [], source: (id) => p.sources.get(id) });
  expect(restored.ok).toBe(false);
  if (restored.ok) throw new Error("Absent original validation must stay unavailable");
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE });
  feed.restored(restored.entries);
  feed.sourceUnavailable(restored.reason, restored.evidence);
  expect(feed.readiness()).toMatchObject({ state: "missing-evidence", reason: expect.stringContaining("validation is unavailable") });
});

it("resolves an exact missingEvidence reference after its actual source is fully reread", () => {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("one", [safe]);
  p.feed.sourceUnavailable("Missing exact source batch.", { ...p.feed.evidence(), missingEvidence: [{ datasetId: "read.one", batchKey: "read/one" }] });
  reread(p.feed, step, "replacement", [safe, fixed], SCHEMA, "page=1");
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.evidence().missingEvidence).toBeUndefined();
});

it("applies the same source-invalid readiness to saved replay batches and clears only the actually repaired page", () => {
  const p = automaticFeed({ where: [{ field: "promoted", equals: "false" }], columns: ["title"] });
  const step = p.read("setup", [safe], schema);
  const replay = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE });
  const batch = { nodeId: "reader", attemptId: "capture", batchKey: "recorded", datasetId: "answer", writeMode: "append" as const, schema, rows: [safe], invalidCount: 1, truncated: false, place: "page=1", listKey: "fixture.records" };
  replay.batches([{ step, batch }]);
  replay.draft(p.steps);
  expect(replay.readiness().state).toBe("missing-evidence");
  expect(replay.evidence().pages[0]).toMatchObject({ source: "recorded", invalidCount: 1, rows: [safe] });
  replay.batches([{ step, batch: { ...batch, rows: [safe, fixed], invalidCount: 0 } }]);
  expect(replay.readiness()).toEqual({ state: "ready" });
  expect(replay.rows().rows).toEqual([safe, fixed]);
});
