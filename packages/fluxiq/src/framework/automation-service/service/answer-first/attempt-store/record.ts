import type { AutomationStudioTaskAttempt, AutomationStudioTaskResult, AutomationStudioTriedRecord } from "@fluxiq/contracts/automation";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstReplayVerdict } from "./replay-verdict.ts";

/** One attempt as it is kept beside its Flow (`./store.ts`). */
export type AutomationStudioAnswerFirstAttemptRecord = {
  attempt: AutomationStudioTaskAttempt;
  /** Absent only until there is one; a budget-out or an achieved attempt has one. */
  result?: AutomationStudioTaskResult;
  tried: AutomationStudioTriedRecord;
  /** The steps the attempt wrote: what a later attempt and a carry-on seed from, kept whether or not they could be assembled into a saved draft. */
  steps?: readonly AutomationStudioFlowDraftStep[];
  /** The draft saved through the candidate store, where it could be assembled. */
  candidateId?: string;
  /** Why an ending that wrote steps has no draft: they did not fit together as a Flow, or saving it failed. Absent where a draft was saved, and on a row written before the attempt ended. */
  draftKept?: "not_assembled" | "not_saved";
  /** How the replay of the saved Flow was checked: stood on its record, or judged for a named deviation (`./replay-verdict.ts`). Absent where no replay was closed. */
  replay?: AutomationStudioAnswerFirstReplayVerdict;
};
