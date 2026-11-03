import type { AutomationStudioProjectBuildRecord } from "./record.ts";
import type { AutomationStudioProjectBuildReturnRecord } from "./return.ts";

/** The main file with every return written so far, as read back. */
export type AutomationStudioProjectBuildRecordView = {
  record: AutomationStudioProjectBuildRecord;
  returns: AutomationStudioProjectBuildReturnRecord[];
};
