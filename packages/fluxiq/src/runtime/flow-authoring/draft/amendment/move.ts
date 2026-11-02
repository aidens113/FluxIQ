import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
export function automationStudioFlowDraftAmendmentMove(steps: AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, to: AutomationStudioFlowDraftStep | undefined, settings: JsonObject | undefined): boolean {
    if (!to)
        return false;
    if (to === step && settings === undefined)
        return false;
    const from = steps.indexOf(step);
    if (from < 0 || !steps.includes(to))
        return false;
    if (to !== step) {
        const down = from < steps.indexOf(to);
        steps.splice(from, 1);
        steps.splice(steps.indexOf(to) + (down ? 1 : 0), 0, step);
        const at = steps.indexOf(step);
        steps.forEach((entry, index) => { entry.position = index + 1; });
        for (const moved of steps.slice(Math.min(from, at)))
            delete moved.replayed;
    }
    if (settings)
        step.settings = { ...(step.settings ?? {}), ...settings };
    return true;
}
