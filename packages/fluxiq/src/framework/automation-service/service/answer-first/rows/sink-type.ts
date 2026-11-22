import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioResultEvidenceBundle } from "../../../../../runtime/result-verification/index.ts";
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
  /**
   * Publish the ledger's declared answer under its step/version dataset, exactly as judged. A store failure propagates.
   * Once it is stored, every other publication the run holds is retired (`./row-sink.ts`, "One result in the run").
   */
  publish(answer: AutomationStudioAnswerFirstRowsSummary, evidence?: AutomationStudioResultEvidenceBundle): Promise<void>;
  /** Retire only this logical attempt's tracked publications when its answer is no longer ready. Failed retirement remains tracked for retry and is reported. */
  withhold(): Promise<void>;
  /**
   * The earlier segment's publication, which a carried-on attempt copied into this run (`./copied-rows.ts`): retired
   * like this sink's own once a publication under another id supersedes it. An id outside the publications' namespace is ignored.
   */
  carried(datasetId: string): void;
  /** What this sink stored, now, from its own account (rows repeated whole are counted once, as processing does). */
  summary(datasetId?: string): AutomationStudioAnswerFirstRowsSummary;
  /** `summary`, read back from the store after processing, so what is judged and shown is what was stored; the sink's own account when the store cannot be read. */
  readBack(datasetId?: string): Promise<AutomationStudioAnswerFirstRowsSummary & { fromStore: boolean }>;
  /**
   * How many reads have answered so far: each call whose answer held a list of rows, none
   * included, that was not lost to a failing store, and each batch a run captured. What says a
   * read ran even where it found nothing (`../completion/check.ts`, `rows_not_read`).
   */
  readsAnswered(): number;
  /**
   * The reads that make up the result's list, one per read since it last started over, each with where it read (the view
   * of the site and the place in it, where the call or its answer said) and how many rows it kept. A further page of it read the
   * same way that kept no row is one, with `kept: 0` (`./row-sink.ts`). Empty while no read stored a row.
   */
};
