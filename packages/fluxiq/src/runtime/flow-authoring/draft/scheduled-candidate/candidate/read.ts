import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { configuration } from "./configuration.ts";
import { held } from "./held-operation.ts";
import type { Held } from "./held.ts";

export function read(step: AutomationStudioFlowDraftStep): Held | undefined {
    const value = held.get(step);
    if (step.ranWith !== undefined || step.replay !== undefined || step.effectApplied !== undefined || step.checkedCandidate !== undefined || step.priorExecution !== undefined)
        return undefined;
    return value && step.scheduledCandidate === value.candidate && configuration(step) === value.configuration ? value : undefined;
}
