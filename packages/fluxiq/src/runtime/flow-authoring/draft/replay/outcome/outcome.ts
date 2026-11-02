import type { AutomationStudioFlowDraftExcusedReason } from "../../excused/index.ts";
import type { AutomationStudioFlowDraftReplayPass } from "../pass.ts";
import type { AutomationStudioFlowDraftReplayStatus } from "../status.ts";

export type AutomationStudioFlowDraftReplayOutcome = {
    step: number;
    stepId?: string;
    actionId: string;
    status: AutomationStudioFlowDraftReplayStatus;
    resultCode?: string;
    mode?: "verify";
    withheldBy?: number;
    reanchored?: true;
    madeOptional?: true;
    passes?: AutomationStudioFlowDraftReplayPass[];
    excused?: AutomationStudioFlowDraftExcusedReason;
};
