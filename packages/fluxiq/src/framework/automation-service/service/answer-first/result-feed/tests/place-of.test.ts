// A read the pager named no place for is told from a next page by where it ran and what it was a read of (t1024):
// the draft step, the page, and how often its list has moved; for a saved Flow's run, the step and the batch key.
// Rows are never compared. Generic catalogue fixtures.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import { resultPipeline } from "./pipeline.ts";

const LIST = "list.catalogue";
const SHELF = "https://shop.example/shelf";
const SCHEMA = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }] };
const rows = (count: number, from = 0): JsonObject[] => Array.from({ length: count }, (_, index) => ({ title: `Item ${from + index + 1}`, price: `${index + 1}` }));
const nextCall = (callId: string) => ({ callId, toolId: "core.run_node", value: { node: "example.next_page", parameters: { nextPage: { list: "extraction.1" } } } });
const moved = { kind: "llm_evidence_tool_execution" as const, effectApplied: true, evidence: { ok: true, status: "succeeded", listMove: { listKey: LIST, verdict: "moved" } } };
const places = (p: ReturnType<typeof resultPipeline>): readonly string[] => p.feed.evidence().coverage[0]?.places ?? [];
const batch = (batchKey: string, count: number, from = 0): AutomationStudioRecordBatch => ({ nodeId: "reader", attemptId: batchKey, batchKey, datasetId: "answer", writeMode: "append", schema: SCHEMA, rows: rows(count, from), invalidCount: 0, truncated: false, location: SHELF, listKey: LIST } as AutomationStudioRecordBatch);

describe("a read the pager named no place for", () => {
  it("replayed on the page its step already read is one place and one page, its rows once", async () => {
    const p = resultPipeline();
    for (let n = 1; n <= 7; n += 1) await p.read({ source: `read.${n}`, rows: rows(3), listKey: LIST, kind: "rerun", extra: { url: SHELF } });
    expect(places(p)).toEqual(["unplaced read 1"]);
    expect(p.feed.slot()).toContain("3 rows over 1 page");
  });

  it("replayed with other rows (the site moved on between runs) is still that one place", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(3), listKey: LIST, kind: "rerun", extra: { url: SHELF } });
    await p.read({ source: "read.2", rows: rows(4, 10), listKey: LIST, kind: "rerun", extra: { url: SHELF } });
    expect(places(p)).toEqual(["unplaced read 1"]);
    expect(p.feed.slot()).toContain("4 rows over 1 page");
  });

  it("is a new place once the list moved in place on the same address, and a replay of that stays one", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(3), listKey: LIST, kind: "rerun", extra: { url: SHELF } });
    p.feed.called(nextCall("next.1"), moved, undefined);
    await p.read({ source: "read.2", rows: rows(3, 3), listKey: LIST, kind: "rerun", extra: { url: SHELF } });
    await p.read({ source: "read.3", rows: rows(3, 3), listKey: LIST, kind: "rerun", extra: { url: SHELF } });
    expect(places(p)).toEqual(["unplaced read 1", "unplaced read 2"]);
    expect(p.feed.slot()).toContain("6 rows over 2 pages");
  });

  it("keeps two draft steps folded into one version apart, and another address its own place", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(2), listKey: LIST, kind: "rerun", id: "s1", extra: { url: SHELF } });
    await p.read({ source: "read.2", rows: rows(2, 2), listKey: LIST, kind: "rerun", id: "s2", extra: { url: SHELF } });
    await p.read({ source: "read.3", rows: rows(2, 4), listKey: LIST, kind: "rerun", id: "s1", extra: { url: "https://shop.example/aisle" } });
    expect(places(p)).toHaveLength(3);
  });

  it("takes the place the pager said for the same spot, so an unplaced replay of it is that page", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(3), listKey: LIST, place: "offset=0", kind: "rerun", extra: { url: SHELF } });
    await p.read({ source: "read.2", rows: rows(3), listKey: LIST, kind: "rerun", extra: { url: SHELF } });
    expect(places(p)).toEqual(["offset=0"]);
  });

  it("keeps two pages the pager named differently apart though they ran on one address", async () => {
    const p = resultPipeline();
    await p.read({ source: "read.1", rows: rows(3), listKey: LIST, place: "page=1", kind: "rerun", extra: { url: SHELF } });
    await p.read({ source: "read.2", rows: rows(3, 3), listKey: LIST, place: "page=2", kind: "rerun", extra: { url: SHELF } });
    expect(places(p)).toEqual(["page=1", "page=2"]);
  });
});

describe("a saved Flow's run", () => {
  it("run three times on one page is one place, its batch keys being the same each time", () => {
    const p = resultPipeline();
    const step = p.step("s1", p.input());
    for (let run = 1; run <= 3; run += 1) p.feed.batches([{ batch: batch("reader.attempt.1", 3), step }]);
    expect(places(p)).toEqual(["unplaced read 1"]);
    expect(p.feed.slot()).toContain("3 rows over 1 page");
  });

  it("with a two-page in-place loop is two places, and a second run of it is those two again", () => {
    const p = resultPipeline();
    const step = p.step("s1", p.input());
    for (let run = 1; run <= 2; run += 1) p.feed.batches([{ batch: batch("reader.attempt.1", 3), step }, { batch: batch("reader.attempt.2", 3, 3), step }]);
    expect(places(p)).toEqual(["unplaced read 1", "unplaced read 2"]);
    expect(p.feed.slot()).toContain("6 rows over 2 pages");
  });
});
