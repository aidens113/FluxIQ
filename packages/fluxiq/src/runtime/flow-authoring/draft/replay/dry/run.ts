import type { AutomationStudioFlowDraftReplayOutcome } from "../outcome/index.ts";

export type AutomationStudioFlowDraftDryRun = {
    attempt: number;
    reset: "ok" | "failed";
    outcomes: AutomationStudioFlowDraftReplayOutcome[];
    providerCalls: 0;
    ok: boolean;
};
