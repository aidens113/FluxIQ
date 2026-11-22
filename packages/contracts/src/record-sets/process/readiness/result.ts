import type { AutomationStudioRecordProcessRowsResult } from "../process-rows.ts";
import type { AutomationStudioRecordProcessingAccount } from "../types.ts";
import type { AutomationStudioRecordProcessingMissingEvidence } from "./missing-evidence.ts";

/** Processing readiness, not universal task success. An explicit minRows: 0 permits a ready empty answer. */
export type AutomationStudioAutomaticRecordProcessRowsResult =
  | ({ state: "ready" } & AutomationStudioRecordProcessRowsResult)
  | { state: "empty"; reason: "uncollected" | "no_matches"; account: AutomationStudioRecordProcessingAccount }
  | { state: "missing-evidence"; missingEvidence: AutomationStudioRecordProcessingMissingEvidence[] };
