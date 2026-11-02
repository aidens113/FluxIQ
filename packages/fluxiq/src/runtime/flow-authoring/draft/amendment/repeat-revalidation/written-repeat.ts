import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStepRouting } from "../../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import type { AutomationStudioFlowDraftAmendment } from "../contracts/index.ts";
import type { Repeat } from "./repeat.ts";

export type AutomationStudioFlowDraftWrittenRepeat = {
    step: AutomationStudioFlowDraftStep;
    routing: Repeat;
    amendment: AutomationStudioFlowDraftAmendment;
    previous: AutomationStudioFlowDraftStepRouting | undefined;
    settings: JsonObject | undefined;
};
