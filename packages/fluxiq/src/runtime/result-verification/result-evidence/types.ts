import type { AutomationStudioRecordProcessingHiddenSortKey } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowLessReadLeftOut } from "../flow-less/index.ts";
import type { AutomationStudioResultEvidenceSourceReplacements } from "./replacement/index.ts";

/** A contributing read, kept whole with its source and current authored version. Shared by both judges. */
export type AutomationStudioResultEvidencePage = {
  source: string;
  /** Actual retained dataset observed for this source; storage chunk keys may change on carry-on. */
  datasetId?: string;
  step: string;
  position?: number;
  version: number;
  conditions: readonly JsonValue[];
  fields: JsonObject;
  listKey?: string;
  where?: string;
  place?: string;
  kept: number;
  rows: readonly JsonObject[];
  /** Original rows rejected by this source's schema validation. Absent is legacy/unknown. */
  invalidCount?: number;
  leftOut?: AutomationStudioFlowLessReadLeftOut | { reported: JsonObject; parameters?: JsonObject };
  carried?: boolean;
};

export type AutomationStudioResultEvidenceCoverage = {
  step: string;
  version: number;
  places: readonly string[];
  first: "read" | "not read" | "unknown";
  last?: { place: string; paging?: { verdict: "moved" } | { verdict: "ended"; reason: string } };
};

/**
 * What the result's processing did to the rows its pages kept before they became the answer (t970): the
 * declaration as set, the counts, and per filter the rows it alone left out, by label. A judge checks each
 * condition against the request's words and each row it left out against the condition, rather than trusting
 * the filtering: a plausible condition once left out three right rows (run-mwodpw10-3d5748ab's recorded rows,
 * `../../llm/node-tools/result/tests/recorded-runs.test.ts`).
 */
export type AutomationStudioResultEvidenceProcessing = {
  declared: JsonObject;
  /** Rows the pages kept, before processing. */
  collected: number;
  /** Rows a filter left out. */
  leftOut: number;
  /** Rows dropped as repeats of an earlier row. */
  repeats: number;
  /** Rows a limit cut. */
  cut: number;
  kept: number;
  /** One per filter, in the declaration's order: its words, how many rows it left out, and those it alone left out, by label. */
  filters: readonly { condition: string; leftOut: number; leftOutOnlyByThis: readonly string[] }[];
  /**
   * Each kept row, in the answer's order, with its asked columns and, beside them, every value the declaration's
   * conditions, dedupe and order read on it (t1072): a filter's or sort's field the asked columns leave out, and a derived
   * column as processing computed it beside the field it is derived from; `null` where the row holds no value. The
   * rows keep every column upstream and the asked columns are a view over them, so the judge checks the order and each
   * condition on the values processing used, row by row, rather than doubting what it cannot see (run-mwyfoz8o-507c92f6,
   * 0101: right rows in the right order were answered no because the sort key was in no row shown). Absent where every
   * value the declaration reads is already an asked column.
   */
  keptRows?: readonly JsonObject[];
  /**
   * Each sort key the asked columns leave out, as the processor read it on the kept rows (t1072): what it read the key
   * as, on how many rows, and for the first key `inOrder`, Core's own reading of whether the kept rows run in that key's
   * order; a few readings, never text. The Flow judge's processing account carries the same
   * (`../processing-account.ts`); beside `keptRows` it says what Core made of the values the judge can check. Absent where
   * every sort key is an asked column.
   */
  hiddenSortKeys?: readonly AutomationStudioRecordProcessingHiddenSortKey[];
};

/** A working read step said by its count alone: one that has read no page yet, or one a bundle stored before t1048 holds. */
export type AutomationStudioResultEvidenceWorkingCount = { step: string; position?: number; listKey?: string; kept: number };

/** Facts for the judge to weigh. No completeness verdict and no guessed page association. */
export type AutomationStudioResultEvidenceBundle = {
  pages: readonly AutomationStudioResultEvidencePage[];
  coverage: readonly AutomationStudioResultEvidenceCoverage[];
  answerContract?: { columns: readonly string[] };
  /**
   * The reads of draft steps that are not the answer (working reads), each page whole with its rows, as a page of the
   * result is (t1048): the judge weighs the answer against every row a working read kept. A working step that has read
   * no page yet, and a bundle stored before t1048, says only its count.
   */
  working: readonly (AutomationStudioResultEvidencePage | AutomationStudioResultEvidenceWorkingCount)[];
  looks: readonly AutomationStudioResultEvidencePage[];
  /** What the result's processing did to the pages' rows (t970); absent where none was declared. */
  processing?: AutomationStudioResultEvidenceProcessing;
  /** Older/unrecorded batches cannot supply page evidence; this is distinct from a validated empty page. */
  missingEvidence?: readonly { datasetId: string; batchKey?: string }[];
  /** Exact framework replacement receipts. Null means optional authority was present but unreadable. */
  sourceReplacements?: AutomationStudioResultEvidenceSourceReplacements | null;
};
