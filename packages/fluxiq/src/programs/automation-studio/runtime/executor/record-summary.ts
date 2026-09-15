// The saved trace's stand-ins for the rows a run captured.
//
// Capture (`record-capture.ts`) puts one validated array in a node's `records`
// output and back at the record output's path inside its `result`. The run's
// own bookkeeping then copies that reference everywhere: `graph-run` writes
// every output into `values` under two keys, `collectNodeInputs` merges
// `values` into every later attempt's `inputs`, and a data node such as Filter
// List hands on the row objects themselves. Rows belong in the run's dataset,
// not in the trace, so the trace a run saves holds a marker wherever a captured
// array or row sits.
//
// Found by identity, never by value. Extracted text can equal anything else the
// run holds, and a rewrite by value would blank unrelated data that merely
// matched a row. An array or row with equal contents but another reference was
// not captured, and it is left as it is.
import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import { FLUXIQ_RUNTIME_WITHHELD_VALUE } from "../../../../runtime/index.ts";
import type { AutomationStudioRecordBatch } from "./contracts.ts";

/** Stands in, in a saved trace, for one captured array. `recordCount` is the capture's length. */
export type AutomationStudioDatasetMarker = { $dataset: { datasetId: string; recordCount: number; schemaDigest?: string } };

/** Stands in, in a saved trace, for one captured row. `ordinal` is its position in the run's dataset, from 1. */
export type AutomationStudioDatasetRowMarker = { $datasetRow: { datasetId: string; ordinal: number } };

export type AutomationStudioRecordTraceMarker = AutomationStudioDatasetMarker | AutomationStudioDatasetRowMarker;

/** Every array and row a run captured, keyed by the value itself, with the marker that stands in for it. */
export type AutomationStudioCapturedRecords = ReadonlyMap<object, AutomationStudioRecordTraceMarker>;

/** What one run captured, and the trace rewrite that replaces it with markers. */
export type AutomationStudioRecordTraceSummary = {
  /**
   * Records one capture. `stored` is the record-batch hook's answer, when a hook
   * is bound and it succeeded; it supplies the schema digest and places the
   * rows after those already stored for this run.
   */
  record(batch: AutomationStudioRecordBatch, stored?: AutomationStudioRunDatasetSummary): void;
  /** Records what a Call Flow child captured. The parent executes with the child's real rows, so they can reach its trace. */
  include(captured: AutomationStudioCapturedRecords): void;
  /** A copy of everything recorded so far, for a parent run to include. */
  captured(): AutomationStudioCapturedRecords;
  /** The trace with every captured array and row replaced by its marker. A run that captured nothing gets its own trace back by identity. */
  apply<TTrace>(trace: TTrace): TTrace;
};

/** The bound `trace-withholding.ts` walks to. A subtree past it is withheld whole, since a row could sit there unseen. */
const MAXIMUM_SUMMARY_DEPTH = 64;

/**
 * Every marker a summary issued. The withholding walk leaves these alone, and
 * only these: an object a domain returned in the same shape is data like any
 * other, and a withheld value inside it is still withheld.
 */
const issuedMarkers = new WeakSet<object>();

export function automationStudioRecordTraceSummary(): AutomationStudioRecordTraceSummary {
  const markers = new Map<object, AutomationStudioRecordTraceMarker>();
  const nextOrdinals = new Map<string, number>();
  return {
    record(batch, stored) {
      const answer = validStoredSummary(stored);
      const firstOrdinal = firstOrdinalFor(batch, answer, nextOrdinals);
      nextOrdinals.set(batch.datasetId, firstOrdinal + batch.rows.length);
      const dataset: AutomationStudioDatasetMarker["$dataset"] = { datasetId: batch.datasetId, recordCount: batch.rows.length };
      const schemaDigest = answer?.schemaDigest ?? batch.schemaDigest;
      if (schemaDigest) dataset.schemaDigest = schemaDigest;
      markers.set(batch.rows, issued({ $dataset: dataset }));
      for (const [index, row] of batch.rows.entries()) {
        markers.set(row, issued({ $datasetRow: { datasetId: batch.datasetId, ordinal: firstOrdinal + index } }));
      }
    },
    include(captured) {
      for (const [value, marker] of captured) markers.set(value, marker);
    },
    captured() {
      return new Map(markers);
    },
    apply<TTrace>(trace: TTrace): TTrace {
      if (!markers.size) return trace;
      // The walk keeps every key and every value that is not captured, so the
      // result has the shape of what it was given, with markers in place.
      return summarizedValue(trace, markers, 0) as TTrace;
    }
  };
}

/** Whether a value is a marker a record trace summary issued. */
export function isAutomationStudioRecordTraceMarker(value: unknown): boolean {
  return typeof value === "object" && value !== null && issuedMarkers.has(value);
}

function issued<TMarker extends AutomationStudioRecordTraceMarker>(marker: TMarker): TMarker {
  issuedMarkers.add(marker);
  return marker;
}

// Ordinals follow the dataset store: `replace` starts again at 1 and `append`
// continues. The store's count includes rows this run's own count cannot see,
// such as a Call Flow child's, so its answer wins when there is one.
function firstOrdinalFor(batch: AutomationStudioRecordBatch, stored: AutomationStudioRunDatasetSummary | undefined, nextOrdinals: ReadonlyMap<string, number>): number {
  if (batch.writeMode === "replace") return 1;
  if (stored) return Math.max(1, stored.recordCount - batch.rows.length + 1);
  return nextOrdinals.get(batch.datasetId) ?? 1;
}

// A hook is host code, so its answer is read only when it has the fields read.
function validStoredSummary(stored: AutomationStudioRunDatasetSummary | undefined): AutomationStudioRunDatasetSummary | undefined {
  if (!stored || typeof stored !== "object") return undefined;
  if (!Number.isInteger(stored.recordCount) || stored.recordCount < 0) return undefined;
  return typeof stored.schemaDigest === "string" ? stored : undefined;
}

function summarizedValue(value: unknown, markers: AutomationStudioCapturedRecords, depth: number): unknown {
  if (!value || typeof value !== "object") return value;
  const marker = markers.get(value);
  if (marker) return marker;
  if (issuedMarkers.has(value)) return value;
  if (depth >= MAXIMUM_SUMMARY_DEPTH) return FLUXIQ_RUNTIME_WITHHELD_VALUE;
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => {
      const summarized = summarizedValue(item, markers, depth + 1);
      if (summarized !== item) changed = true;
      return summarized;
    });
    return changed ? items : value;
  }
  let changed = false;
  const record: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const summarized = summarizedValue(item, markers, depth + 1);
    if (summarized !== item) changed = true;
    record[key] = summarized;
  }
  // A subtree holding nothing captured is handed back as it arrived.
  return changed ? record : value;
}
