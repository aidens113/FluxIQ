// A read of a list a saved Flow's run already read, on the same page, is that page again (t1074; bigbox run
// run-mwynbry2-f3c88dc7, attempt 2). The run's record batch of the read step (0044) held a stale quantity, the model
// re-ran the step twice (0051, 0068) and read the page once by hand (0076), and the answer kept the batch's rows
// throughout (judge 0059), then held both readings (judge 0080). Generic catalogue fixtures.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../../../../../../engine/automation/contracts.ts";
import { resultPipeline } from "../../pipeline.ts";

const LIST = "list.basket";
const BASKET = "https://shop.example/basket";
const SCHEMA = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }, { id: "price", label: "Price", valueType: "string" }, { id: "url", label: "url", valueType: "string" }] };
const line = (title: string, price: string, url: string): JsonObject => ({ title, price, url });

describe("a re-read of a list a saved Flow's run read", () => {
  it("replaces the run's page on the same address, place said or not", async () => {
    const p = resultPipeline();
    const step = p.step("s1", p.input());
    const batch = { nodeId: "reader", attemptId: "reader.attempt.1", batchKey: "reader.attempt.1", datasetId: "answer", writeMode: "append", schema: SCHEMA, rows: [line("Soap", "1", "https://shop.example/p/soap"), line("Towels", "2", "https://shop.example/p/towels")], invalidCount: 0, truncated: false, location: BASKET, listKey: LIST, place: "offset=0" } as AutomationStudioRecordBatch;
    p.feed.draft([step]);
    p.feed.batches([{ batch, step }]);
    expect(p.feed.rows().rows.map((row) => row.price)).toEqual(["1", "2"]);
    await p.read({ source: "rerun.1", rows: [line("Soap", "1", "https://shop.example/p/soap"), line("Towels", "1", "https://shop.example/p/towels")], listKey: LIST, kind: "rerun", id: "s1", extra: { url: BASKET } });
    expect(p.feed.rows().rows.map((row) => [row.title, row.price])).toEqual([["Soap", "1"], ["Towels", "1"]]);
  });

  it("as attempt 2 fed it: the run's page, two re-runs, then a read by hand made a step, give two rows, both quantity 1", async () => {
    const p = resultPipeline();
    const step = p.step("s13", p.input(), 13);
    const absolute = (name: string) => `https://shop.example/p/${name}`;
    const batch = { nodeId: "reader", attemptId: "reader.attempt.13", batchKey: "reader.attempt.13", datasetId: "answer", writeMode: "append", schema: SCHEMA, rows: [line("Soap", "1", absolute("soap")), line("Towels", "2", absolute("towels"))], invalidCount: 0, truncated: false, location: BASKET, listKey: LIST, place: "offset=0" } as AutomationStudioRecordBatch;
    p.feed.draft([step]);
    p.feed.batches([{ batch, step }]);
    for (const source of ["rerun-extract.13", "rerun-extract-2.13"]) {
      await p.read({ source, rows: [line("Soap", "1", absolute("soap")), line("Towels", "1", absolute("towels"))], listKey: LIST, kind: "rerun", id: "s13", position: 13, extra: { url: BASKET } });
    }
    expect(p.feed.rows().rows.map((row) => [row.title, row.price])).toEqual([["Soap", "1"], ["Towels", "1"]]);
    // The read by hand keeps the links as the page writes them (relative), so its rows are not whole-row repeats of the run's.
    await p.read({ source: "reread-cart", rows: [line("Soap", "1", "/p/soap"), line("Towels", "1", "/p/towels")], listKey: LIST, kind: "add", position: 16, extra: { url: BASKET, place: "offset=0" } });
    expect(p.feed.rows().rows.map((row) => [row.title, row.price])).toEqual([["Soap", "1"], ["Towels", "1"]]);
    expect(p.feed.rows().totalRows).toBe(2);
  });
});
