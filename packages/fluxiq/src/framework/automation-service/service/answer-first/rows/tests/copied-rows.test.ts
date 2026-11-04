// A carried-on attempt's rows brought into its new run: under the same dataset ids, the result's
// last, once each, by a key that says where they came from; and what the row showed where the
// store cannot say.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordBatch } from "../../../../../../engine/automation/contracts.ts";
import type { AutomationStudioRunDatasetPage, AutomationStudioRunDatasetSummary, AutomationStudioTaskResultRows } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstCopyRows } from "../copied-rows.ts";

const SCHEMA = { schemaVersion: "0.1", fields: [{ id: "title", label: "Title", valueType: "string" }] } as AutomationStudioRunDatasetPage["schema"];
const summary = (datasetId: string): AutomationStudioRunDatasetSummary => ({ runId: "run.old", datasetId, nodeIds: [], schemaDigest: "digest", recordCount: 0, truncated: false, invalidCount: 0, updatedAt: 1 });
const SHOWN: AutomationStudioTaskResultRows = { runId: "run.old", datasetId: "loans", totalRows: 2, truncated: false, columns: [{ id: "title", label: "Title" }], previewRows: [{ title: "Atlas" }, { title: "Birds" }] };

function sinkOf(fails = false) {
  const batches: AutomationStudioRecordBatch[] = [];
  return {
    batches,
    sink: {
      recordBatch: async (batch: AutomationStudioRecordBatch) => {
        if (fails) throw new Error("no store");
        batches.push(batch);
        return summary(batch.datasetId);
      }
    }
  };
}

function storedWith(pages: Record<string, readonly AutomationStudioRunDatasetPage["rows"][]>, order: readonly string[]) {
  return {
    runId: "run.old",
    list: async () => order.map(summary),
    page: async ({ datasetId, cursor }: { datasetId: string; limit: number; cursor?: string }): Promise<AutomationStudioRunDatasetPage | null> => {
      const at = Number(cursor ?? 0);
      const rows = pages[datasetId]?.[at];
      return rows ? { summary: summary(datasetId), schema: SCHEMA, rows: [...rows], nextCursor: at + 1 < (pages[datasetId]?.length ?? 0) ? String(at + 1) : null } : null;
    }
  };
}

describe("copying a run's rows", () => {
  it("goes under the same ids with the result's dataset last, a row repeated whole once, and a page to a batch", async () => {
    const { sink, batches } = sinkOf();
    // The store lists most recently written first.
    const stored = storedWith({ loans: [[{ title: "Atlas" }, { title: "Atlas" }], [{ title: "Birds" }, { title: "Atlas" }]], lookup: [[{ title: "Elsewhere" }]] }, ["lookup", "loans"]);
    expect(await automationStudioAnswerFirstCopyRows({ sink, stored, shown: SHOWN })).toEqual({ ok: true, rows: 3 });
    expect(batches.map((batch) => [batch.datasetId, batch.rows])).toEqual([["lookup", [{ title: "Elsewhere" }]], ["loans", [{ title: "Atlas" }]], ["loans", [{ title: "Birds" }]]]);
    expect(batches.every((batch) => batch.writeMode === "append" && batch.invalidCount === 0 && batch.schema === SCHEMA)).toBe(true);
  });

  it("keys a batch by where it came from, so copying the same rows again is the same batch", async () => {
    const stored = storedWith({ loans: [[{ title: "Atlas" }], [{ title: "Birds" }]] }, ["loans"]);
    const once = sinkOf();
    const again = sinkOf();
    await automationStudioAnswerFirstCopyRows({ sink: once.sink, stored, shown: SHOWN });
    await automationStudioAnswerFirstCopyRows({ sink: again.sink, stored, shown: SHOWN });
    expect(once.batches.map((batch) => batch.batchKey)).toEqual(again.batches.map((batch) => batch.batchKey));
    expect(new Set(once.batches.map((batch) => batch.batchKey)).size).toBe(2);
    const other = sinkOf();
    await automationStudioAnswerFirstCopyRows({ sink: other.sink, stored: { ...stored, runId: "run.other" }, shown: SHOWN });
    expect(other.batches[0]?.batchKey).not.toBe(once.batches[0]?.batchKey);
  });

  it("with no store it brings what the row showed, marked short where it was", async () => {
    const { sink, batches } = sinkOf();
    expect(await automationStudioAnswerFirstCopyRows({ sink, stored: undefined, shown: { ...SHOWN, totalRows: 9 } })).toEqual({ ok: true, rows: 2 });
    expect(batches).toEqual([expect.objectContaining({ datasetId: "loans", rows: SHOWN.previewRows, truncated: true })]);
  });

  it("a store that cannot be read brings what the row showed, and says it was not all", async () => {
    const { sink, batches } = sinkOf();
    const stored = { runId: "run.old", list: async () => { throw new Error("locked"); }, page: async () => null };
    expect(await automationStudioAnswerFirstCopyRows({ sink, stored, shown: SHOWN })).toEqual({ ok: false, rows: 2 });
    expect(batches).toHaveLength(1);
  });

  it("a store that takes nothing costs the rows and nothing else, and nothing there to bring is no failure", async () => {
    expect(await automationStudioAnswerFirstCopyRows({ sink: sinkOf(true).sink, stored: storedWith({ loans: [[{ title: "Atlas" }]] }, ["loans"]), shown: SHOWN })).toEqual({ ok: false, rows: 0 });
    expect(await automationStudioAnswerFirstCopyRows({ sink: sinkOf().sink, stored: undefined, shown: undefined })).toEqual({ ok: true, rows: 0 });
  });
});
