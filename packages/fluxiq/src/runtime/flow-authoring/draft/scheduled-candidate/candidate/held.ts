import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftScheduledCandidate } from "./scheduled-candidate.ts";

export type Held = {
    candidate: AutomationStudioFlowDraftScheduledCandidate;
    configuration: string;
    input: JsonObject;
    from: JsonObject | undefined;
};
