/** The six edits of the reduced grammar, where the framework drafts the Flow (`./index.ts`). */
export const AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES = ["keep", "drop", "result", "repeat", "unrepeat", "bind"] as const;

export type AutomationStudioFlowDraftEditChange = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_EDIT_CHANGES)[number];
