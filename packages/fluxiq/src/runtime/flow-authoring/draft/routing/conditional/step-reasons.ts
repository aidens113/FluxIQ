import { automationStudioFlowDraftStepAnsweredInterruption } from "../../interruption.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../step/index.ts";
import { automationStudioFlowDraftRepeatIsWhile } from "../repeat/index.ts";
import { automationStudioFlowDraftStepId } from "../step/index.ts";
import type { AutomationStudioFlowDraftConditionalReason } from "./reason.ts";

export function automationStudioFlowDraftConditionalStepReasons(steps: readonly AutomationStudioFlowDraftStep[]): ReadonlyMap<string, AutomationStudioFlowDraftConditionalReason> {
    const reasons = new Map<string, AutomationStudioFlowDraftConditionalReason>();
    const add = (id: string, reason: AutomationStudioFlowDraftConditionalReason): void => {
        if (!reasons.has(id))
            reasons.set(id, reason);
    };
    for (const step of steps) {
        if (automationStudioFlowDraftStepAnsweredInterruption(step))
            add(automationStudioFlowDraftStepId(step), "interruption");
        const routing = step.routing;
        if (!routing)
            continue;
        if (routing.kind === "optional")
            add(automationStudioFlowDraftStepId(step), "optional");
        if (routing.kind === "only_if") {
            add(automationStudioFlowDraftStepId(step), "only_if");
            add(routing.check, "check");
        }
        if (routing.kind === "on_failed")
            add(routing.to, "fallback");
        if (routing.kind === "repeat" && !automationStudioFlowDraftRepeatIsWhile(routing))
            for (const member of repeatedSpan(steps, step, routing.through))
                add(member, "repeat");
    }
    return reasons;
}

function repeatedSpan(steps: readonly AutomationStudioFlowDraftStep[], first: AutomationStudioFlowDraftStep, through: string): string[] {
    const start = steps.indexOf(first);
    const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === through);
    if (start < 0 || end < start)
        return [automationStudioFlowDraftStepId(first)];
    return steps.slice(start, end + 1).filter(automationStudioFlowDraftStepIsProposed).map(automationStudioFlowDraftStepId);
}
