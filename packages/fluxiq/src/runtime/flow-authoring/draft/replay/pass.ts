import type { AutomationStudioFlowDraftReplayStatus } from "./status.ts";

export type AutomationStudioFlowDraftReplayPass = {
    pass: number;
    status: AutomationStudioFlowDraftReplayStatus;
    resultCode?: string;
};
