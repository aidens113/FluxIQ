import { expect, it } from "vitest";
import { automaticFeed, SCHEMA } from "./automatic-support.ts";
import { reread } from "./source-validation-support.ts";

const row = { id: "a", title: "A" };
function fixture(place = "page=1") {
  const p = automaticFeed({ columns: ["title"] });
  const step = p.read("reused", [row], SCHEMA, place);
  p.feed.sourceUnavailable("Legacy originals are unavailable.", { pages: [], coverage: [], working: [], looks: [] });
  const end = () => p.feed.port.record([{ kind: "paging", stepId: p.feed.idOf(step), paging: { verdict: "ended", reason: "The actual pager has no further page." } }]);
  const complete = (readSince: number, callIds = ["reused"]) => p.feed.collectionReplaced({ from: 1, to: p.steps.length, readSince, callIds, steps: p.steps });
  return { ...p, step, end, complete };
}

it("requires actual first-page and pagination-end facts, not merely a successful one-page walk", () => {
  const p = fixture();
  const readSince = p.feed.port.ledger().seq;
  reread(p.feed, p.step, "reused", [row], SCHEMA, "page=1");
  expect(p.complete(readSince)).toMatchObject({ replaced: false, said: expect.stringContaining("not a complete collection") });
  expect(p.feed.readiness().state).toBe("missing-evidence");
  p.end();
  expect(p.complete(readSince)).toEqual({ replaced: true, kind: "fresh_collection", sources: ["reused"], readSince });
  expect(p.feed.readiness()).toEqual({ state: "ready" });
  expect(p.feed.evidence().pages[0]?.carried).not.toBe(true);
});

it.each(["page=2", "cursor=opaque"])("cannot infer site collection start from the first page encountered: %s", (place) => {
  const p = fixture(place);
  const readSince = p.feed.port.ledger().seq;
  reread(p.feed, p.step, "reused", [row], SCHEMA, place);
  p.end();
  expect(p.complete(readSince)).toMatchObject({ replaced: false });
  expect(p.feed.readiness().state).toBe("missing-evidence");
});

it("pins next-allocation watermark semantics and rejects prior-invocation pages even with reused call ids", () => {
  const p = fixture();
  const last = p.feed.port.ledger().steps[0]!.pages[0]!.seq;
  const firstStart = p.feed.port.ledger().seq;
  expect(last).toBe(firstStart - 1);
  expect(p.complete(firstStart)).toMatchObject({ replaced: false });
  reread(p.feed, p.step, "reused", [row], SCHEMA, "page=1");
  expect(p.feed.port.ledger().steps[0]!.pages[0]!.seq).toBe(firstStart);
  p.end();
  const secondStart = p.feed.port.ledger().seq;
  expect(p.complete(secondStart)).toMatchObject({ replaced: false });
  reread(p.feed, p.step, "reused", [row], SCHEMA, "page=1");
  p.end();
  expect(p.complete(secondStart)).toMatchObject({ replaced: true, kind: "fresh_collection" });
});

it("does not use old valid pages to fill gaps in a fresh partial paginator", () => {
  const p = fixture();
  p.read("older-page", [{ id: "b", title: "B" }], SCHEMA, "page=2");
  const readSince = p.feed.port.ledger().seq;
  reread(p.feed, p.step, "reused", [row], SCHEMA, "page=1");
  p.end();
  expect(p.complete(readSince, ["reused", "older-page"])).toMatchObject({ replaced: false });
  expect(p.feed.readiness().state).toBe("missing-evidence");
});

it("does not hide an uncollected declared writer merely because its node has no parameter named read", () => {
  const p = fixture();
  const original = p.step.input.parameters as Record<string, unknown>;
  original.recordOutput = { datasetId: "answer", writeMode: "append", schema: SCHEMA };
  p.steps.push({ id: "missing-writer", callId: "missing-writer", position: 2, disposition: "kept", proposes: true, effect: "observe", toolId: "core.run_node", actionId: "fixture.other-read", input: { node: "fixture.other-read", parameters: { recordOutput: { datasetId: "answer", writeMode: "append", schema: JSON.parse(JSON.stringify(SCHEMA)) } } } });
  p.feed.draft(p.steps);
  const readSince = p.feed.port.ledger().seq;
  reread(p.feed, p.step, "reused", [row], SCHEMA, "page=1");
  p.end();
  expect(p.complete(readSince)).toMatchObject({ replaced: false });
  expect(p.feed.readiness().state).toBe("missing-evidence");
});

it("refuses an unrelated complete collection when the original list identity is known", () => {
  const p = automaticFeed({ columns: ["title"] });
  p.read("original", [row]);
  p.feed.sourceUnavailable("Unrecorded source remains.", { ...p.feed.evidence(), missingEvidence: [{ datasetId: "unknown" }] });
  const readSince = p.feed.port.ledger().seq;
  const value = { node: "fixture.read", parameters: { read: { fields: { title: ".title" } } } };
  p.feed.expect({ kind: "add", position: 2, intermediate: false });
  p.feed.called({ callId: "other", toolId: "core.run_node", value }, { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { read: { extracted: [{ title: "Other" }], listKey: "unrelated.records", place: "page=1" } } }, { datasetId: "read.other", schema: { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] }, rows: [{ title: "Other" }], invalidCount: 0, truncated: false });
  p.steps.push({ id: "other", callId: "other", position: 2, disposition: "kept", proposes: true, effect: "observe", input: value, toolId: "core.run_node", actionId: "fixture.read" });
  p.feed.port.record([{ kind: "paging", stepId: "other", paging: { verdict: "ended", reason: "No further page." } }]);
  expect(p.feed.collectionReplaced({ from: 1, to: 2, readSince, callIds: ["other"], steps: p.steps })).toMatchObject({ replaced: false });
  expect(p.feed.readiness().state).toBe("missing-evidence");
});
