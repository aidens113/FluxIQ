import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftAmendmentChange } from "../changes/index.ts";

export type AutomationStudioFlowDraftAmendment = {
    step: number;
    change: AutomationStudioFlowDraftAmendmentChange;
    settings?: JsonObject;
    to?: number;
    input?: JsonObject;
    check?: number;
    through?: number;
    over?: number;
    while?: number;
    most?: number;
    act?: string;
    place?: string;
};
