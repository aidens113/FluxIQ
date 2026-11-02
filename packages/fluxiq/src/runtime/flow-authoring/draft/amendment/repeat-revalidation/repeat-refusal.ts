import { automationStudioFlowDraftRepeatOrderProblem, automationStudioFlowDraftRepeatIsWhile, automationStudioFlowDraftStepById } from "../../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal } from "../contracts/index.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "../shown-numbering/index.ts";
import type { Repeat } from "./repeat.ts";

export function automationStudioFlowDraftRepeatRefusal(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, routing: Repeat, amendment: AutomationStudioFlowDraftAmendment, shown: AutomationStudioFlowDraftShownNumbering): AutomationStudioFlowDraftAmendmentRefusal | undefined {
    const problem = automationStudioFlowDraftRepeatOrderProblem(steps, step, routing);
    if (!problem)
        return undefined;
    if (problem === "span_broken" || automationStudioFlowDraftRepeatIsWhile(routing))
        return { step: amendment.step, reason: "no_such_position" };
    const over = automationStudioFlowDraftStepById(steps, routing.over)!;
    const through = automationStudioFlowDraftStepById(steps, routing.through)!;
    const after = steps.indexOf(over) > steps.indexOf(step) && amendment.through !== undefined && through !== step;
    return { step: amendment.step, reason: "over_not_before", over: shown.number(over), ...(after ? { through: shown.number(through) } : {}) };
}
