import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { context, datasetPort, records } from "../../tests/support.ts";
import { createDirectoryFileWriter } from "../directory-file-writer.ts";
import { deliverSink } from "../deliver-sink.ts";
import { encodeCsv } from "../encode-csv.ts";

const rows = records([{ id: 1, name: 'Ann "A", Jr', tags: ["x"], note: null }, { id: 2, name: "Bo", extra: true }]);
let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("sinks", () => {
  it("stores a dataset through the run datasets port and returns its reference", async () => {
    const port = datasetPort();
    const ref = await deliverSink("out", { kind: "dataset", name: "listings" }, rows, context({ writeDataset: port.write }));
    expect(ref).toEqual({ datasetId: "ds-listings", name: "listings", rowCount: 2 });
    expect(port.stored.get("listings")?.[1]).toEqual({ id: 2, name: "Bo", extra: true });
  });

  it("encodes CSV with quoting, a column for each key and JSON for structures", () => {
    expect(encodeCsv(rows.map((record) => record.data))).toBe('id,name,tags,note,extra\r\n1,"Ann ""A"", Jr","[""x""]",,\r\n2,Bo,,,true\r\n');
  });

  it("writes JSON and CSV files only inside the caller directory", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "pipeline-sink-"));
    const ports = { writeFile: createDirectoryFileWriter(directory) };
    await deliverSink("out", { kind: "file", format: "json", path: "exports/rows.json" }, rows, context(ports));
    await deliverSink("out", { kind: "file", format: "csv", path: "rows.csv" }, rows, context(ports));
    expect(JSON.parse(await readFile(path.join(directory, "exports", "rows.json"), "utf8"))).toHaveLength(2);
    expect((await readFile(path.join(directory, "rows.csv"), "utf8")).startsWith("id,name")).toBe(true);
    await expect(ports.writeFile("../escape.json", "x")).rejects.toMatchObject({ code: "pipeline.file_outside_directory" });
    await expect(ports.writeFile(path.resolve(directory, "..", "abs.json"), "x")).rejects.toMatchObject({ code: "pipeline.file_outside_directory" });
    await expect(deliverSink("out", { kind: "file", format: "json", path: "../escape.json" }, rows, context(ports))).rejects.toMatchObject({ code: "pipeline.bad_sink" });
  });

  it("posts a webhook through the injected fetch, and refuses credentials in the address", async () => {
    const posts: Array<{ url: string; body: string }> = [];
    const fetch = async (url: string, init: { body: string }) => {
      posts.push({ url, body: init.body });
      return { ok: true, status: 200 };
    };
    await deliverSink("hook", { kind: "webhook", url: "https://example.com/in" }, rows, context({ fetch }));
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]?.body ?? "{}")).toMatchObject({ pipeline: "demo.pipeline", runId: "run-1", stepId: "hook" });
    await expect(deliverSink("hook", { kind: "webhook", url: "https://user:secret@example.com/in" }, rows, context({ fetch }))).rejects.toMatchObject({ code: "pipeline.bad_sink" });
    await expect(deliverSink("hook", { kind: "webhook", url: "http://example.com/in" }, rows, context({ fetch }))).rejects.toMatchObject({ code: "pipeline.bad_sink" });
    expect(posts).toHaveLength(1);
    const failing = async () => ({ ok: false, status: 500 });
    await expect(deliverSink("hook", { kind: "webhook", url: "https://example.com/in" }, rows, context({ fetch: failing }))).rejects.toMatchObject({ code: "pipeline.webhook_failed" });
  });

  it("hands records to the program callback over the event port", async () => {
    const seen: unknown[] = [];
    const sdk = { transform: async () => [], sink: async (request: unknown) => void seen.push(request) };
    await deliverSink("tell", { kind: "sdk", callback: "onRows" }, rows, context({ sdk }));
    expect(seen).toEqual([{ stepId: "tell", callback: "onRows", records: rows.map((record) => record.data) }]);
  });

  it("says which port is missing", async () => {
    await expect(deliverSink("out", { kind: "dataset", name: "d" }, rows, context())).rejects.toMatchObject({ code: "pipeline.no_writeDataset" });
  });
});
