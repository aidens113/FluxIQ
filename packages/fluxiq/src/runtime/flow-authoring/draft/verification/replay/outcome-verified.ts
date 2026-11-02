import type { AutomationStudioFlowDraftReplayOutcome } from "../../replay/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE } from "./verified-code.ts";

export function automationStudioFlowDraftReplayOutcomeVerified(outcome: AutomationStudioFlowDraftReplayOutcome): boolean {
    return outcome.mode === "verify" && outcome.status === "replayed" && outcome.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE;
}
