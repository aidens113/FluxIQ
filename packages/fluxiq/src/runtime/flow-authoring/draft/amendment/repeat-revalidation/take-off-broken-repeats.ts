import { automationStudioFlowDraftRepeatOrderProblem, automationStudioFlowDraftRepeatIsWhile, automationStudioFlowDraftStepById } from "../../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../contracts/index.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "../shown-numbering/index.ts";

export function automationStudioFlowDraftTakeOffBrokenRepeats(steps: readonly AutomationStudioFlowDraftStep[], shown: AutomationStudioFlowDraftShownNumbering): AutomationStudioFlowDraftAmendmentRefusal[] {
    const taken: AutomationStudioFlowDraftAmendmentRefusal[] = [];
    for (const step of steps) {
        const routing = step.routing;
        if (routing?.kind !== "repeat")
            continue;
        const problem = automationStudioFlowDraftRepeatOrderProblem(steps, step, routing);
        if (!problem)
            continue;
        delete step.routing;
        for (const changed of steps.slice(steps.indexOf(step)))
            delete changed.replayed;
        const over = automationStudioFlowDraftRepeatIsWhile(routing) ? undefined : automationStudioFlowDraftStepById(steps, routing.over)!;
        const through = automationStudioFlowDraftStepById(steps, routing.through)!;
        const span = problem === "span_broken";
        taken.push({
            step: shown.number(step), reason: "repeat_taken_off", ...(over === undefined ? {} : { over: shown.number(over) }), takenOff: problem,
            ...(span ? { through: shown.number(through) } : {}),
            ...(step.position !== shown.number(step) ? { now: step.position } : {}),
            ...(over !== undefined && over.position !== shown.number(over) ? { overNow: over.position } : {}),
            ...(span && through.position !== shown.number(through) ? { throughNow: through.position } : {})
        });
    }
    return taken;
}
