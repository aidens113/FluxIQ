import type { AutomationStudioFlowDraftAmendmentChange } from "../changes.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES, type AutomationStudioFlowDraftEditChange } from "./changes.ts";

/** Whether a change is one of the six the reduced grammar takes. */
export function automationStudioFlowDraftChangeIsEdit(change: AutomationStudioFlowDraftAmendmentChange): change is AutomationStudioFlowDraftEditChange {
  return (AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES as readonly string[]).includes(change);
}
