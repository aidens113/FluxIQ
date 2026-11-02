import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftStepId } from "../step/index.ts";
import type { AutomationStudioFlowDraftStepRouting } from "../step/index.ts";
import { automationStudioFlowDraftRepeatIsWhile } from "./is-while.ts";

export function automationStudioFlowDraftRepeatOrderProblem(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, routing: Extract<AutomationStudioFlowDraftStepRouting, {
    kind: "repeat";
}>): "over_after" | "span_broken" | undefined {
    const start = steps.indexOf(step);
    const indexOf = (id: string): number => steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === id);
    const through = indexOf(routing.through);
    if (automationStudioFlowDraftRepeatIsWhile(routing)) {
        if (start < 0 || through < 0)
            return undefined;
        return through < start ? "span_broken" : undefined;
    }
    const over = indexOf(routing.over);
    if (start < 0 || over < 0 || through < 0)
        return undefined;
    if (over >= start)
        return "over_after";
    if (through < start)
        return "span_broken";
    return undefined;
}
