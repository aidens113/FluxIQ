import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { read } from "./read.ts";

export function automationStudioFlowDraftScheduledCandidateCall(step: AutomationStudioFlowDraftStep): {
    input: JsonObject;
    from?: JsonObject;
} | undefined {
    const value = read(step);
    if (!value)
        return undefined;
    return { input: structuredClone(value.input), ...(value.from === undefined ? {} : { from: structuredClone(value.from) }) };
}
