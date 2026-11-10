import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstReadPage } from "./list-page.ts";
import type { AutomationStudioAnswerFirstRowCall, AutomationStudioAnswerFirstRowsStored } from "./rows-call.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "./rows-summary.ts";

export type AutomationStudioAnswerFirstRowSink = {
  /**
   * One tool call's answer. Stores what a real read returned, `undefined`
   * when the answer holds no list of rows. Never takes a row from the call's
   * input or from a model's words, and never throws for a store failure.
   */
  fromCall(call: AutomationStudioAnswerFirstRowCall, answer: AutomationStudioLlmEvidenceToolExecutionResult): Promise<AutomationStudioAnswerFirstRowsStored | undefined>;
  /**
   * One batch a saved Flow's run captured, as the engine hands it to `onRecordBatch`. Its rows
   * join this sink's account, and a later read of the same list joins them (`./row-sink.ts`).
   * A store that fails throws, which the engine reads as the step failing: rows the Flow says
   * it saves are never dropped in silence.
   */
  recordBatch(batch: AutomationStudioRecordBatch): Promise<AutomationStudioRunDatasetSummary>;
  /**
   * A judge said no with a run's rows as the result: they no longer outrank or take in a later
   * read, which is how a run that found the wrong list stops standing in the repair's way.
   * What was stored stays stored; a later read simply becomes the result by the plain rule.
   */
  runRowsRefused(): void;
  /** What this sink stored, now, from its own account (rows repeated whole are counted once, as processing does). */
  summary(): AutomationStudioAnswerFirstRowsSummary;
  /** `summary`, read back from the store after processing, so what is judged and shown is what was stored; the sink's own account when the store cannot be read. */
  readBack(): Promise<AutomationStudioAnswerFirstRowsSummary & { fromStore: boolean }>;
  /**
   * How many reads have answered so far: each call whose answer held a list of rows, none
   * included, that was not lost to a failing store, and each batch a run captured. What says a
   * read ran even where it found nothing (`../completion/check.ts`, `rows_not_read`).
   */
  readsAnswered(): number;
  /**
   * The reads that make up the result's list, one per read since it last started over, each with where it read (the view
   * of the site and the place in it, where the call or its answer said) and how many rows it kept. Empty while no read stored a row.
   */
  readPages(): AutomationStudioAnswerFirstReadPage[];
};
