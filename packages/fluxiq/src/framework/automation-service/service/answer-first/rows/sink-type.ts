import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioAnswerFirstRowCall, AutomationStudioAnswerFirstRowsStored } from "./rows-call.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "./rows-summary.ts";

export type AutomationStudioAnswerFirstRowSink = {
  /**
   * One tool call's answer. Stores what a real read returned, `undefined`
   * when the answer holds no list of rows. Never takes a row from the call's
   * input or from a model's words, and never throws for a store failure.
   */
  fromCall(call: AutomationStudioAnswerFirstRowCall, answer: AutomationStudioLlmEvidenceToolExecutionResult): Promise<AutomationStudioAnswerFirstRowsStored | undefined>;
  /** What this sink stored, now, from its own account (rows repeated whole are counted once, as processing does). */
  summary(): AutomationStudioAnswerFirstRowsSummary;
  /** `summary`, read back from the store after processing, so what is judged and shown is what was stored; the sink's own account when the store cannot be read. */
  readBack(): Promise<AutomationStudioAnswerFirstRowsSummary & { fromStore: boolean }>;
};
