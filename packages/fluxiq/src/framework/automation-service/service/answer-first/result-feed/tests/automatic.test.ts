import { expect, it } from "vitest";
import { automationStudioAnswerFirstRestoreResult, automationStudioAnswerFirstResultFeed, readAutomationStudioAnswerFirstResultEvidence } from "../index.ts";
import { automationStudioAnswerFirstResultProcessingCall, automationStudioAnswerFirstStepsWithResultProcessing, automationStudioAnswerFirstTaskProcessing } from "../../result-processing/index.ts";
import { automaticFeed, REFERENCE, SCHEMA } from "./automatic-support.ts";

it("automatically filters full occurrences before identity, types hidden sort keys, and preserves original values/exclusions", () => {
  const p = automaticFeed({ where: [{ field: "Promoted", equals: "false" }], sort: [{ field: "Price", order: "asc" }], columns: ["Title"], limit: 2 });
  const original = [{ id: "a", title: "Promoted A", price: "$1", promoted: true, secret: "excluded" }, { id: "a", title: "Organic A", price: "$10", promoted: false }, { id: "b", title: "B", price: "$2", promoted: false }, { id: "b", title: "B", price: "$2", promoted: false }];
  const before = structuredClone(original);
  p.read("read-one", original);
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.rows()).toMatchObject({ rows: [original[2], original[1]], columns: [{ id: "title", label: "Title" }], schema: { primaryKey: ["id"] } });
  expect(p.feed.boundProcessing()).toMatchObject({ sort: [{ field: "price", order: "asc", as: "number" }], declaration: { version: 1, revision: 1, bindings: { Promoted: "promoted", Price: "price", Title: "title" } } });
  expect(p.feed.evidence().processing).toMatchObject({ collected: 4, leftOut: 1, repeats: 1, kept: 2 });
  expect(p.feed.rows().schema?.fields.some((field) => field.id === "secret")).toBe(false);
  expect(original).toEqual(before);
});

it("falls back to whole allowed originals when a declared identity is incomplete", () => {
  const p = automaticFeed({ columns: ["title"] });
  p.read("one", [{ title: "Same", price: "$2", promoted: false }, { title: "Same", price: "$3", promoted: false }]);
  expect(p.feed.rows().totalRows).toBe(2);
});

it("reads a captured flag the item does not show as a definite no, and withholds rows naming the source/operator when sort evidence is unreadable", () => {
  // Until t993 this flag withheld the answer as missing evidence. The read captured `promoted` and this item does not
  // show it, so the item is not promoted; a field a read never captured still withholds (`not-shown.test.ts`).
  const p = automaticFeed({ where: [{ field: "promoted", equals: "true", not: true }], columns: ["title"] });
  p.read("one", [{ id: "a", title: "Unknown", price: "$2" }]);
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.rows()).toMatchObject({ datasetId: "step.one.v1", totalRows: 1, rows: [{ id: "a", title: "Unknown", price: "$2" }] });
  const sort = automaticFeed({ sort: [{ field: "Price", order: "asc" }], columns: ["Title"] });
  sort.read("two", [{ title: "Unreadable", price: "unknown" }]);
  expect(sort.feed.readiness()).toMatchObject({ state: "missing-evidence", reason: expect.stringContaining("sort[0] price (unreadable)") });
});

it("distinguishes a new missing declaration, explicit N/A and valid empty criteria", () => {
  const missing = automaticFeed();
  const declared = { ...missing.processing, task: {} };
  const feed = automationStudioAnswerFirstResultFeed({ instructionText: "Find records", readRowsKey: "read.extracted", processing: declared, processingReferenceTimeMs: REFERENCE });
  expect(feed.readiness()).toMatchObject({ state: "missing-evidence", code: "answer_first.processing_declaration_missing" });
  const action = automationStudioAnswerFirstResultFeed({ instructionText: "Renew a loan", readRowsKey: undefined, processing: { ...declared, task: null }, processingReferenceTimeMs: REFERENCE });
  expect(action.readiness()).toEqual({ state: "not-applicable" });
  missing.read("one", [{ title: "One" }]);
  expect(missing.feed.readiness()).toEqual({ state: "ready" });
  expect(automationStudioAnswerFirstTaskProcessing({ instructionText: "Old saved job", declared: undefined, kept: undefined, legacy: true })).toBeUndefined();
  expect(automationStudioAnswerFirstTaskProcessing({ instructionText: "New job", declared: undefined, kept: undefined, legacy: false })?.task).toEqual({});
});

it("keeps minRows:0 empty data readable only with a captured source and full schema", () => {
  const p = automaticFeed({ minRows: 0, columns: ["title"] });
  expect(p.feed.readiness().state).toBe("missing-evidence");
  p.read("empty", []);
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.rows()).toMatchObject({ datasetId: "step.empty.v1", totalRows: 0, rows: [], schema: { primaryKey: ["id"] } });
  const normal = automaticFeed({ columns: ["title"] });
  normal.read("empty", []);
  expect(normal.feed.readiness()).toMatchObject({ code: "answer_first.processing_empty" });
  const minimum = automaticFeed({ minRows: 2 });
  minimum.read("one", [{ title: "One" }]);
  expect(minimum.feed.readiness()).toMatchObject({ code: "answer_first.processing_below_min_rows" });
});

it("refuses conflicting retained schema metadata without silently inferring a replacement", () => {
  const p = automaticFeed({ columns: ["title"] });
  p.read("one", [{ title: "A", price: "$1" }], SCHEMA, "page=1");
  p.read("two", [{ title: "B", price: "2030-01-01" }], { ...SCHEMA, fields: SCHEMA.fields.map((field) => field.id === "price" ? { ...field, semanticType: "date" } : field) }, "page=2");
  expect(p.feed.readiness()).toMatchObject({ code: "answer_first.processing_schema_missing", reason: expect.stringContaining("semantic_type_conflict") });
  expect(p.feed.rows().rows).toEqual([]);
});

it("holds an explicit evidenced amendment, refuses model stamps/blind changes, and saves the same canonical declaration", () => {
  const p = automaticFeed({ where: [{ field: "Price", atMost: 5 }], columns: ["Title"] });
  p.read("one", [{ title: "A", price: "$2" }, { title: "B", price: "$10" }]);
  const run = { result: p.feed, steps: p.steps, trail: [] };
  const call = (value: Parameters<typeof automationStudioAnswerFirstResultProcessingCall>[1]["value"]) => automationStudioAnswerFirstResultProcessingCall(run, { callId: "amend", toolId: "core.set_result_processing", value });
  expect(call({ process: { columns: ["title"] } }).evidence).toMatchObject({ ok: false, said: expect.stringContaining("needs why") });
  expect(call({ process: { declaration: { version: 1 } }, why: "Changed evidence" }).evidence).toMatchObject({ ok: false, said: expect.stringContaining("framework_owned") });
  expect(call({ process: { where: [{ field: "Price", atMost: 20 }], columns: ["Title"] }, why: "The person corrected the maximum to 20." }).evidence).toMatchObject({ ok: true, changed: true, kept: 2 });
  expect(p.feed.processingDeclaration()?.revision).toBe(2);
  expect(call({ process: { where: [{ field: "Price", atMost: 20 }], columns: ["Title"] } }).evidence).toMatchObject({ ok: true, changed: false });
  expect(p.feed.processingDeclaration()?.revision).toBe(2);
  // Since t984 (e2b1f2635) an automatic declaration is written only into a record output the step already has, so a
  // plain read step stays assemblable; this fixture's read declares none until the step is given one (t993).
  expect(automationStudioAnswerFirstStepsWithResultProcessing(run)[0]).toEqual(p.steps[0]);
  p.steps[0] = { ...p.steps[0]!, settings: { recordOutput: { datasetId: "read.one" } } };
  const saved = automationStudioAnswerFirstStepsWithResultProcessing(run);
  expect(saved[0]?.input.parameters).toMatchObject({ recordOutput: { datasetId: "read.one", process: p.feed.boundProcessing() } });
  expect(run.trail).toHaveLength(4);
});

it("restores full contributing originals and a stable reference without relying on displayed previews", () => {
  const p = automaticFeed({ where: [{ field: "Date", atLeast: "2030-01-09", as: "date" }], columns: ["Title"] });
  const raw = [{ id: "a", title: "Recent", date: "1 day ago", promoted: false }, { id: "b", title: "Old", date: "4 days ago", promoted: false }];
  p.read("one", raw);
  const evidence = readAutomationStudioAnswerFirstResultEvidence(JSON.parse(JSON.stringify(p.feed.evidence())))!;
  expect(evidence.pages[0]?.rows).toEqual(raw);
  const restored = automationStudioAnswerFirstRestoreResult({ evidence, steps: p.steps, batches: [], source: (id) => p.sources.get(id) });
  expect(restored.ok).toBe(true);
  if (!restored.ok) throw new Error(restored.reason);
  const later = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: REFERENCE });
  later.restored(restored.entries);
  later.draft(p.steps);
  expect(later.rows().rows).toEqual(p.feed.rows().rows);
  expect(later.collected()?.rows).toEqual(raw);
  const noClock = automationStudioAnswerFirstResultFeed({ instructionText: "List the matching records.", readRowsKey: "read.extracted", processing: p.processing, processingReferenceTimeMs: null });
  noClock.restored(restored.entries);
  expect(noClock.readiness()).toMatchObject({ code: "answer_first.processing_reference_missing" });
  expect(noClock.rows().rows).toEqual([]);
});

it("refuses absent, mismatched or corrupt contributing provenance instead of accepting raw/preview fallback", () => {
  const p = automaticFeed({ columns: ["title"] });
  p.read("one", [{ title: "Actual", price: "$2" }]);
  const attempt = (evidence = p.feed.evidence(), steps = p.steps) => automationStudioAnswerFirstRestoreResult({ evidence, steps, batches: [], source: (id) => p.sources.get(id) });
  expect(automationStudioAnswerFirstRestoreResult({ evidence: undefined, steps: p.steps, batches: [], source: () => undefined }).ok).toBe(false);
  expect(attempt({ ...p.feed.evidence(), pages: [{ ...p.feed.evidence().pages[0]!, rows: [{ title: "Invented" }] }] }).ok).toBe(false);
  expect(attempt(p.feed.evidence(), [{ ...p.steps[0]!, input: { node: "fixture.read", parameters: { read: { fields: { title: ".other" } } } } }]).ok).toBe(false);
  expect(readAutomationStudioAnswerFirstResultEvidence({ pages: [{ source: "bad" }], coverage: [], working: [], looks: [] })).toBeUndefined();
});
