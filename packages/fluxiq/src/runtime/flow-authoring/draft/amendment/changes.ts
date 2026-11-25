import type { AutomationStudioFlowDraftEditChange } from "./edits/index.ts";

/** Every change one amendment may ask for (`./index.ts` says what each does). */
export const AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES = ["add", "drop", "exploratory", "keep", "reorder", "rerun", "optional", "only_if", "on_failed", "repeat", "unrepeat", "bind", "take"] as const;

/** The old grammar's thirteen, and `result`, which only the framework-drafted grammar takes (`./edits/`). */
export type AutomationStudioFlowDraftAmendmentChange = (typeof AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES)[number] | AutomationStudioFlowDraftEditChange;
