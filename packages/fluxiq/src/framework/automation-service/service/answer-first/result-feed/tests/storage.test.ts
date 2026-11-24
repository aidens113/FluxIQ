import { describe, expect, it } from "vitest";
import { resultPipeline } from "./pipeline.ts";

const row = (title: string, price = 1) => ({ title, price });

describe("the declared result and published dataset are the same records", () => {
  it("orders pages by their declared place, replaces a reread only at its place, and publishes exactly that answer", async () => {
    const p = resultPipeline();
    await p.read({ source: "s1", place: "page=2", rows: [row("C")] });
    await p.read({ source: "s2", position: 2, place: "page=1", rows: [row("A"), row("B")] });
    await p.sink.publish(p.feed.rows());
    await p.read({ source: "s3", position: 3, place: "page=1", rows: [row("B", 9), row("A")] });
    const answer = p.feed.rows();
    expect(answer).toMatchObject({ datasetId: "step.s1.v1", totalRows: 3, rows: [row("B", 9), row("A"), row("C")] });
    await p.sink.publish(answer);
    // Since t982 (3b85dd9d0, P1 retained schemas) the summary also carries the schema the publication stored; a
    // legacy answer has none of its own, so the publication's is its columns as JSON (t993).
    expect(p.sink.summary(answer.datasetId)).toEqual({ ...answer, schema: { schemaVersion: "0.1", fields: answer.columns.map(({ id, label }) => ({ id, label, valueType: "json" })) } });
    expect(p.batches.at(-1)).toMatchObject({ writeMode: "replace", datasetId: "step.s1.v1", process: { dedupe: false }, rows: answer.rows });
    expect(p.feed.evidence().pages.map((page) => [page.source, page.step, page.version, page.place])).toEqual([["s3", "s1", 1, "page=1"], ["s1", "s1", 1, "page=2"]]);
  });

  it("keeps two distinct source records that become identical displayed columns", async () => {
    const p = resultPipeline();
    await p.read({ source: "s1", place: "page=1", rows: [{ ...row("A"), link: "one" }, { ...row("A"), link: "two" }] });
    expect(p.feed.rows().rows).toEqual([row("A"), row("A")]);
    await p.sink.publish(p.feed.rows());
    expect(p.batches.at(-1)?.rows).toEqual([row("A"), row("A")]);
    // A publication names its displayed columns since t982 (3b85dd9d0), so a reader projects them from the full row (t993).
    expect(p.batches.at(-1)?.process).toEqual({ dedupe: false, columns: ["title", "price"] });
  });

  it.each([{ dedupe: { by: ["title"] }, expected: 1 }, { dedupe: false, expected: 3 }])("respects declared dedupe $dedupe before projecting", async ({ dedupe, expected }) => {
    const p = resultPipeline();
    await p.read({ source: "s1", value: p.input([], undefined, { dedupe }), rows: [{ ...row("A"), link: "one" }, { ...row("A"), link: "two" }, { ...row("A"), link: "two" }] });
    expect(p.feed.rows().totalRows).toBe(expected);
    await p.sink.publish(p.feed.rows());
    expect(p.sink.summary(p.feed.rows().datasetId).rows).toEqual(p.feed.rows().rows);
  });

  it("a look, even with more rows or replace, never changes the answer; take explicitly adopts it", async () => {
    const p = resultPipeline();
    await p.read({ source: "s1", place: "page=1", rows: [row("A")] });
    const look = await p.read({ source: "look", kind: "look", place: "page=1", value: { ...p.input(), recordOutput: { writeMode: "replace" } }, rows: [row("B"), row("C")] });
    expect(look.line).toContain("look");
    expect(p.feed.rows().rows).toEqual([row("A")]);
    p.feed.port.record([{ kind: "take", source: "look", step: { id: "taken", position: 2 } }]);
    expect(p.feed.rows().rows).toEqual([row("B"), row("C")]);
  });

  it("a current version discards old pages and publishes a separate version dataset", async () => {
    const p = resultPipeline();
    await p.read({ source: "s1", place: "page=1", rows: [row("A"), row("B")] });
    await p.read({ source: "s2", kind: "rerun", id: "s1", value: p.input([{ field: "price", lt: 2 }]), place: "page=1", rows: [row("A")] });
    expect(p.feed.rows()).toMatchObject({ datasetId: "step.s1.v2", rows: [row("A")] });
    await p.sink.publish(p.feed.rows());
    expect(p.sink.summary("step.s1.v2").rows).toEqual([row("A")]);
  });

  it("a failed raw store cannot contribute a page, and a failed publication is visible", async () => {
    let refuse = true;
    const p = resultPipeline(undefined, async () => { if (refuse) throw new TypeError("store refused"); });
    const failed = await p.read({ source: "s1", rows: [row("A")] });
    expect(failed.saved?.failure?.code).toBe("answer_first.rows_not_stored");
    expect(p.feed.rows().totalRows).toBe(0);
    refuse = false;
    await p.read({ source: "s2", rows: [row("A")] });
    refuse = true;
    await expect(p.sink.publish(p.feed.rows())).rejects.toThrow("store refused");
  });

  it("the header and every change/look line count the actual shaped answer rather than raw duplicate captures", async () => {
    const p = resultPipeline();
    const first = await p.read({ source: "s1", place: "page=1", rows: [row("A"), row("A"), row("B")] });
    expect(first.line).toMatch(/^result 0 → 2 rows/u);
    expect(p.feed.slot()).toMatch(/2 rows over 1 page/u);
    expect(p.feed.slot()).toMatch(/3 rows kept before result processing/u);
    const look = await p.read({ source: "look", kind: "look", rows: [row("C")] });
    expect(look.line).toContain("2 rows");
  });

  it("a source id outside the dataset grammar keeps its exact provenance and a legal stable storage key", async () => {
    const p = resultPipeline();
    const source = "read/a:one " + "x".repeat(250);
    await p.read({ source, place: "offset=0", rows: [row("A")] });
    expect(p.feed.rows().datasetId).toMatch(/^step\.id-[a-f0-9]{64}\.v1$/u);
    expect(p.feed.evidence().pages[0]?.source).toBe(source);
    expect(p.feed.evidence().pages[0]?.step).toBe(source);
    await p.sink.publish(p.feed.rows(), p.feed.evidence());
    expect(p.sink.summary(p.feed.rows().datasetId).rows).toEqual([row("A")]);
  });
});
