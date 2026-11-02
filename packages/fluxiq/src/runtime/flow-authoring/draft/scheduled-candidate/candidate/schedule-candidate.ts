import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { configuration } from "./configuration.ts";
import { held } from "./held-operation.ts";
import { saved } from "./saved.ts";

export function automationStudioFlowDraftScheduleCandidate(step: AutomationStudioFlowDraftStep, sourceNodeId: string, from: JsonObject | undefined, declarationRequired = true): void {
    if (!sourceNodeId)
        return;
    saved.set(step, structuredClone(step.input));
    const declarations = step.input.consequences;
    const declared = Array.isArray(declarations) && declarations.every((value) => typeof value === "string");
    if (!declared && declarationRequired)
        return;
    const candidate = Object.freeze({ sourceNodeId });
    step.scheduledCandidate = candidate;
    held.set(step, { candidate, configuration: configuration(step), input: structuredClone(step.input), from: from === undefined ? undefined : structuredClone(from) });
}
