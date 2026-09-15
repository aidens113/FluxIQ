import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import {
  automationStudioRunDatasetExportBody,
  type AutomationStudioRunDatasetExportChunk,
  type AutomationStudioRunDatasetExportSource,
  type AutomationStudioRunDatasetExportTotals
} from "../export-body.ts";
import { automationStudioRunDatasetExportEncoder } from "../export-encoder.ts";

const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string" },
    { id: "price", label: "Price", valueType: "number" }
  ]
};

type Read = { afterOrdinal: unknown; limit: unknown };

describe("automationStudioRunDatasetExportBody", () => {
  it("reads 500-row pages in ordinal order and reports running totals on every chunk", async () => {
    const reads: Read[] = [];
    const { chunks, text, totals } = await drain(body({ source: source(1_200, reads) }));
    expect(reads).toEqual([{ afterOrdinal: 0, limit: 500 }, { afterOrdinal: 500, limit: 500 }, { afterOrdinal: 1_000, limit: 500 }]);
    expect(chunks.map((chunk) => chunk.rowCount)).toEqual([0, 500, 1_000, 1_200]);
    let sent = "";
    for (const chunk of chunks) {
      sent += chunk.text;
      expect(chunk.byteCount).toBe(Buffer.byteLength(sent));
    }
    expect(totals).toEqual({ rowCount: 1_200, byteCount: Buffer.byteLength(text), truncated: false });
    expect(text.split("\r\n")).toHaveLength(1_202);
  });

  it("keeps exactly maxRows rows untruncated and stops before one more", async () => {
    await expect(drain(body({ source: source(3), maxRows: 3 }))).resolves.toMatchObject({ totals: { rowCount: 3, truncated: false } });
    const cut = await drain(body({ source: source(3), maxRows: 2 }));
    expect(cut.totals).toMatchObject({ rowCount: 2, truncated: true });
    expect(cut.text).toBe("Title,Price\r\nitem 1,1\r\nitem 2,2\r\n");
  });

  it("keeps room for the JSON footer, so a body cut at the byte cap still parses and stays within it", async () => {
    const full = await drain(body({ source: source(3), format: "json" }));
    const fullBytes = Buffer.byteLength(full.text);
    await expect(drain(body({ source: source(3), format: "json", maxBytes: fullBytes }))).resolves.toMatchObject({ totals: { rowCount: 3, truncated: false } });
    const cut = await drain(body({ source: source(3), format: "json", maxBytes: fullBytes - 1 }));
    expect(cut.totals).toEqual({ rowCount: 2, byteCount: Buffer.byteLength(cut.text), truncated: true });
    expect(cut.totals.byteCount).toBeLessThanOrEqual(fullBytes - 1);
    expect(JSON.parse(cut.text)).toEqual([{ title: "item 1", price: 1 }, { title: "item 2", price: 2 }]);
  });

  it("ends on an empty page even when the source claims more rows", async () => {
    let calls = 0;
    const stuck: AutomationStudioRunDatasetExportSource = {
      async readRows() {
        calls += 1;
        return { rows: [], lastOrdinal: 0, hasMore: true };
      }
    };
    await expect(drain(body({ source: stuck }))).resolves.toMatchObject({ text: "Title,Price\r\n", totals: { rowCount: 0, truncated: false } });
    expect(calls).toBe(1);
  });

  it("passes a read failure to the caller", async () => {
    const failing: AutomationStudioRunDatasetExportSource = {
      async readRows() {
        throw new Error("read failed");
      }
    };
    const chunks = body({ source: failing });
    await expect(chunks.next()).resolves.toMatchObject({ done: false, value: { text: "Title,Price\r\n" } });
    await expect(chunks.next()).rejects.toThrow("read failed");
  });
});

function body(input: { source: AutomationStudioRunDatasetExportSource; format?: "csv" | "json"; maxRows?: number; maxBytes?: number }) {
  return automationStudioRunDatasetExportBody({
    source: input.source,
    runId: "run.a",
    datasetId: "listings",
    encoder: automationStudioRunDatasetExportEncoder(SCHEMA, input.format ?? "csv"),
    maxRows: input.maxRows ?? 100_000,
    maxBytes: input.maxBytes ?? 256 * 1024 * 1024
  });
}

function source(total: number, reads: Read[] = []): AutomationStudioRunDatasetExportSource {
  return {
    async readRows(input) {
      reads.push({ afterOrdinal: input.afterOrdinal, limit: input.limit });
      const after = Number(input.afterOrdinal ?? 0);
      const count = Math.max(0, Math.min(Number(input.limit ?? 500), total - after));
      const rows = Array.from({ length: count }, (_, index) => ({ title: `item ${after + index + 1}`, price: after + index + 1 }));
      return { rows, lastOrdinal: after + count, hasMore: after + count < total };
    }
  };
}

async function drain(
  chunks: AsyncGenerator<AutomationStudioRunDatasetExportChunk, AutomationStudioRunDatasetExportTotals, undefined>
): Promise<{ chunks: AutomationStudioRunDatasetExportChunk[]; text: string; totals: AutomationStudioRunDatasetExportTotals }> {
  const seen: AutomationStudioRunDatasetExportChunk[] = [];
  let step = await chunks.next();
  while (!step.done) {
    seen.push(step.value);
    step = await chunks.next();
  }
  return { chunks: seen, text: seen.map((chunk) => chunk.text).join(""), totals: step.value };
}
