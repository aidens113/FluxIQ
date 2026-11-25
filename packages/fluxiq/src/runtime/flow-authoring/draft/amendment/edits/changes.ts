/** The seven edits of the reduced grammar, where the framework drafts the Flow (`./index.ts`). */
export const AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES = ["keep", "drop", "result", "repeat", "unrepeat", "bind", "rerun"] as const;

export type AutomationStudioFlowDraftEditChange = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES)[number];
