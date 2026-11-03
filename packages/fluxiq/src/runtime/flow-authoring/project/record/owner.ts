import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../../framework/persistence/paths/index.ts";

/** Actual path owners only; the original project object is the cache key. */
export interface AutomationStudioProjectRecordOwner {
  readonly paths: { readonly projects: AutomationStudioProjectPaths; readonly flows: AutomationStudioFlowPaths };
}
