// The shapes of an answer-first attempt's one result (`./ledger.ts`): what the ledger is fed, and what it holds.
//
// Design: `docs/working/mvp-launch-plan/reports/result-evidence-design.md` (b)1, in the web extension's repository.
// The result is the output of the draft's read steps, each page as last read at its place under the step's current
// version (I1). Rows are only what a read kept; what it saw and did not keep is left-out evidence beside them (I4).
// Nothing here is cut or capped: a page holds every row its read kept.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowLessReadLeftOut } from "../../../../../runtime/result-verification/index.ts";

/**
 * What a read step reads: its `where` conditions as the call wrote them, its fields, and the list's identity as the
 * domain declared it from the site's structure (`listKey`, opaque, compared for equality only). Absent `listKey` is
 * "not said", never a different list.
 */
export type AutomationStudioAnswerFirstResultVersion = { conditions: readonly JsonValue[]; fields: JsonObject; listKey?: string };

/** What the pager said after a page: the records moved on, or the list ended, with the reason it gave. */
export type AutomationStudioAnswerFirstResultPaging = { verdict: "moved" } | { verdict: "ended"; reason: string };

/** One read as its answer handed it on: the input a page or a look is made from. */
export type AutomationStudioAnswerFirstResultRead = {
  /** The read call's id, or the record batch's id for a saved Flow's run. */
  source: string;
  version: AutomationStudioAnswerFirstResultVersion;
  /** Where in the list, as the domain's answer said it (`page=2`, `offset=40`, `cursor=abc`). Absent: not said. */
  place?: string;
  /** The rows the read's conditions kept, every one. */
  kept: readonly JsonObject[];
  /** What its conditions saw and did not keep. Evidence, never rows. */
  leftOut?: AutomationStudioFlowLessReadLeftOut;
  /** The view of the site it read, without what only turns the page. */
  where?: string;
  paging?: AutomationStudioAnswerFirstResultPaging;
  /** Copied from an earlier attempt's result by a carry-on, not read in this attempt. */
  carried?: boolean;
};

/** A draft read step as the draft names it: its stable id, its position now, and whether the model marked it a working read. */
export type AutomationStudioAnswerFirstResultStepRef = { id: string; position: number; intermediate?: boolean };

/** Everything that can change the result, as plain data. Each is one row of the design's operations table. */
export type AutomationStudioAnswerFirstResultEvent =
  /** A draft read step read a page: by hand with `add`, a rerun, a run's pass, a saved run's record batch, or a carry-on. */
  | { kind: "page"; step: AutomationStudioAnswerFirstResultStepRef; read: AutomationStudioAnswerFirstResultRead }
  /** A read step is in the draft as this version: added, or amended (a changed version drops the old version's pages). */
  | { kind: "step"; step: AutomationStudioAnswerFirstResultStepRef; version: AutomationStudioAnswerFirstResultVersion }
  /** What the pager said after the step's most recently read page, where it was said after the page was recorded. */
  | { kind: "paging"; stepId: string; paging: AutomationStudioAnswerFirstResultPaging }
  /** A read step left the draft. */
  | { kind: "dropped"; stepId: string }
  /** A read that is not a draft step. It never changes the result. */
  | { kind: "look"; read: AutomationStudioAnswerFirstResultRead }
  /** `amend_draft {change: "take"}`: the draft took the look `source` as this step. */
  | { kind: "take"; source: string; step: AutomationStudioAnswerFirstResultStepRef };

/** One page of a step version, as last read at its place. */
export type AutomationStudioAnswerFirstResultPage = {
  source: string;
  place: string | undefined;
  kept: readonly JsonObject[];
  leftOut: AutomationStudioFlowLessReadLeftOut | undefined;
  where: string | undefined;
  paging: AutomationStudioAnswerFirstResultPaging | undefined;
  carried: boolean;
  /** When it was set, counting the ledger's reads: which page is the step's most recent. */
  seq: number;
};

/** One read step of the draft, with any later steps that read the same list the same way folded into it (lead decision D2). */
export type AutomationStudioAnswerFirstResultStep = {
  id: string;
  position: number;
  intermediate: boolean;
  /** Draft steps folded into this one: same `listKey`, conditions and fields. Their pages are this step's. */
  folded: readonly { id: string; position: number }[];
  /** The version's number, from 1: a changed version is the next number. */
  version: number;
  reads: AutomationStudioAnswerFirstResultVersion;
  /** The current version's pages, in place order. */
  pages: readonly AutomationStudioAnswerFirstResultPage[];
};

/** The request's named columns, in its order, and whether the reader was sure of them (`./answer-contract.ts`). */
export type AutomationStudioAnswerFirstAnswerContract = {
  columns: readonly string[];
  sure: boolean;
  /** Where unsure: the leading words of the item that ran on, which may be one more column. Empty where sure. */
  maybe: readonly string[];
};

/** The attempt's one result. Every statement about it is worked out from this, never stored beside it. */
export type AutomationStudioAnswerFirstResultLedger = {
  contract: AutomationStudioAnswerFirstAnswerContract;
  steps: readonly AutomationStudioAnswerFirstResultStep[];
  looks: readonly AutomationStudioAnswerFirstResultRead[];
  /** Looks the draft took as steps (`take`), each call and the step it became. */
  taken: readonly { source: string; stepId: string }[];
  /** Pages set so far: the next page's `seq`. */
  seq: number;
};

/** What a step version has read of its list, as facts (`./coverage.ts`). Never "complete": the judge decides. */
export type AutomationStudioAnswerFirstResultCoverage = {
  /** Each page's label, in place order. */
  places: readonly string[];
  /** Whether the list's first place is among them: known only where the places are numbered. */
  first: "read" | "not read" | "unknown";
  /** The last place in order and what the pager said after it, where it said anything. */
  last: { place: string; paging: AutomationStudioAnswerFirstResultPaging | undefined } | undefined;
};
