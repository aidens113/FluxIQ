import type { AutomationStudioFlowDraftReplayOutcome } from "../../replay/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE } from "../../site-memory/index.ts";
import { automationStudioFlowDraftReplayOutcomeVerified } from "./outcome-verified.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE } from "./present-code.ts";

export function automationStudioFlowDraftReplayOutcomeWord(outcome: AutomationStudioFlowDraftReplayOutcome): string {
    if (automationStudioFlowDraftReplayOutcomeVerified(outcome))
        return "verified";
    if (outcome.status !== "replayed")
        return outcome.status;
    if (outcome.mode === "verify")
        return outcome.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE ? "present" : outcome.status;
    return outcome.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE ? "remembered" : outcome.status;
}
