import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE } from "../../site-memory/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE } from "./run-issue-code.ts";
import type { AutomationStudioFlowDraftDryRun } from "./run.ts";

export function automationStudioFlowDraftDryRunIssueCodes(verdict: AutomationStudioFlowDraftDryRun): string[] {
    const codes = verdict.outcomes
        .filter((outcome) => outcome.status !== "replayed")
        .flatMap((outcome) => [
        outcome.resultCode ?? `core.replay.${outcome.status}`,
        ...(outcome.reanchored ? [AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE] : [])
    ]);
    return [...new Set([
            AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE,
            ...(verdict.reset === "failed" ? ["core.replay.reset_failed"] : []),
            ...codes
        ])];
}
