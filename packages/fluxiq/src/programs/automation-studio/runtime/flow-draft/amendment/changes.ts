/** Every change one amendment may ask for (`./index.ts` says what each does). */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES = ["add", "drop", "exploratory", "keep", "reorder", "rerun", "optional", "only_if", "on_failed", "repeat", "unrepeat", "bind"] as const;

export type AutomationStudioFlowDraftAmendmentChange = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES)[number];
