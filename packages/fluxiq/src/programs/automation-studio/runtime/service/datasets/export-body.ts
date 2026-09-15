import type { AutomationStudioProjectRunDatasetStore } from "../../../storage/index.ts";
import type { AutomationStudioRunDatasetExportEncoder } from "./export-encoder.ts";

/** What the body reads rows from: the run dataset store, or a fake in tests. */
export type AutomationStudioRunDatasetExportSource = Pick<AutomationStudioProjectRunDatasetStore, "readRows">;

/** One piece of body text, with the rows and UTF-8 bytes written so far, this piece included. */
export type AutomationStudioRunDatasetExportChunk = { text: string; rowCount: number; byteCount: number };

export type AutomationStudioRunDatasetExportTotals = { rowCount: number; byteCount: number; truncated: boolean };

/** Rows read per store call: the store's `readRows` ceiling. */
const READ_PAGE_ROWS = 500;

/**
 * One run dataset's export body in ordinal order: the header, one chunk per
 * 500-row page read from the store, then the footer, each chunk carrying running
 * totals. It stops before the first row that would pass `maxRows`, or whose bytes
 * plus the largest footer would pass `maxBytes`, so the body ends on a whole row,
 * stays valid CSV or JSON, and never passes `maxBytes`; the returned totals then
 * say `truncated`. It writes no audit event; its callers do.
 */
export async function* automationStudioRunDatasetExportBody(input: {
  source: AutomationStudioRunDatasetExportSource;
  runId: string;
  datasetId: string;
  encoder: AutomationStudioRunDatasetExportEncoder;
  maxRows: number;
  maxBytes: number;
}): AsyncGenerator<AutomationStudioRunDatasetExportChunk, AutomationStudioRunDatasetExportTotals, undefined> {
  const { encoder } = input;
  const header = encoder.header();
  let byteCount = utf8Bytes(header);
  let rowCount = 0;
  let truncated = false;
  yield { text: header, rowCount, byteCount };
  let afterOrdinal = 0;
  let hasMore = true;
  while (hasMore && !truncated) {
    const page = await input.source.readRows({ runId: input.runId, datasetId: input.datasetId, afterOrdinal, limit: READ_PAGE_ROWS });
    let text = "";
    for (const row of page.rows) {
      if (rowCount >= input.maxRows) {
        truncated = true;
        break;
      }
      const line = encoder.row(row, rowCount);
      const lineBytes = utf8Bytes(line);
      if (byteCount + lineBytes + encoder.footerMaxBytes > input.maxBytes) {
        truncated = true;
        break;
      }
      text += line;
      byteCount += lineBytes;
      rowCount += 1;
    }
    if (text) yield { text, rowCount, byteCount };
    // An empty page ends the body even if the source claims more, so a bad answer cannot loop forever.
    if (page.rows.length === 0) break;
    afterOrdinal = page.lastOrdinal;
    hasMore = page.hasMore;
  }
  const footer = encoder.footer(rowCount);
  byteCount += utf8Bytes(footer);
  if (footer) yield { text: footer, rowCount, byteCount };
  return { rowCount, byteCount, truncated };
}

function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}
