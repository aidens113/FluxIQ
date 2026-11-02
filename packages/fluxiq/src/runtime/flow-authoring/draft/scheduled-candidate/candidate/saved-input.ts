import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { saved } from "./saved.ts";

export function automationStudioFlowDraftSavedInput(step: AutomationStudioFlowDraftStep): JsonObject | undefined {
    const value = saved.get(step);
    return value === undefined ? undefined : structuredClone(value);
}
