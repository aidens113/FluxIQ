import type { AutomationStudioFlowDraftExcusedReason } from "../excused/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome } from "../replay/index.ts";
export type DraftExcusedFacts = {
    reason: AutomationStudioFlowDraftExcusedReason;
    status: Exclude<AutomationStudioFlowDraftReplayOutcome["status"], "replayed">;
    withheldBy?: number | undefined;
};
