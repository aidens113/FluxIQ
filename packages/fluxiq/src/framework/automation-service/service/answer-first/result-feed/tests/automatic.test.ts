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

// Every result read of one list is the answer, deduplicated by the data layer's row identity (t1091). The provider-free
// kestrel harness (t1082, attempt 2): the carried read step read page 2 of the list, and a new extraction of the same
// list read page 1; the answer was page 1's alone. Here a listing slid across the page boundary, so both pages hold it.
const SEARCH = "https://shop.example/search?q=lamp";

it("answers from every result read of one list, page 2 then page 1 with other extractions, merged and deduplicated by identity", () => {
  const p = automaticFeed({ columns: ["title"] });
  const narrow: typeof SCHEMA = { schemaVersion: "0.1", primaryKey: ["id"], fields: SCHEMA.fields.filter((field) => ["id", "title", "price"].includes(field.id)) };
  p.read("page-two", [{ id: "j", title: "J", price: "$5", promoted: false }, { id: "k", title: "K", price: "$6", promoted: false }, { id: "l", title: "L", price: "$7", promoted: true }], SCHEMA, "page=2", undefined, `${SEARCH}&page=2`);
  p.read("page-one", [{ id: "h", title: "H", price: "$3" }, { id: "i", title: "I", price: "$4" }, { id: "j", title: "J", price: "$5" }], narrow, "page=1", undefined, SEARCH);
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.rows().rows.map((row) => row.title)).toEqual(["J", "K", "L", "H", "I"]);
  expect(p.feed.evidence().pages.map((page) => page.source)).toEqual(["page-two", "page-one"]);
  expect(p.feed.evidence().processing).toMatchObject({ collected: 6, repeats: 1, kept: 5 });
  expect(p.feed.slot()).toContain("each a result read of the same list, 5 rows in all");
});

// Two overlapping pages of one list, read by two extractions, under a declaration with no dedupe key and schemas with no
// primary key (the kestrel declaration's shape). The listings on both pages hold different fields under each read, so
// the whole-row identity kept them twice; the fields both reads share, here the asked columns, say they are one (t1091).
it("keeps a listing on two overlapping pages read by two extractions once, judged on the fields both reads hold", () => {
  const p = automaticFeed({ where: [{ field: "bids", contains: "bid" }], sort: [{ field: "ends", order: "asc", as: "date" }], columns: ["title", "price", "bids"] });
  const field = (id: string) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), valueType: "string" as const });
  const narrow: typeof SCHEMA = { schemaVersion: "0.1", fields: ["title", "price", "bids", "ends"].map(field) };
  const wide: typeof SCHEMA = { schemaVersion: "0.1", fields: ["title", "price", "bids", "ends", "seller"].map(field) };
  const lot = (title: string, day: number, seller?: string) => ({ title, price: "$20", bids: "3 bids", ends: `2030-01-${String(day).padStart(2, "0")}`, ...(seller ? { seller } : {}) });
  p.read("page-one", [lot("A", 11), lot("B", 12), lot("C", 13), lot("D", 14)], narrow, "page=1", undefined, SEARCH);
  p.read("page-two", [lot("C", 13, "north"), lot("D", 14, "north"), lot("E", 15, "south")], wide, "page=2", undefined, `${SEARCH}&page=2`);
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.rows().rows.map((row) => row.title)).toEqual(["A", "B", "C", "D", "E"]);
  expect(p.feed.evidence().processing).toMatchObject({ collected: 7, repeats: 2, kept: 5 });
  // The declaration as bound, saved and shown to the judge is the model's: the key is this evaluation's alone.
  expect(p.feed.boundProcessing()?.dedupe).toBeUndefined();
});
