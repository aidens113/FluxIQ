import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal } from "../contracts/index.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "../shown-numbering/index.ts";
import { automationStudioFlowDraftRepeatRefusal } from "./repeat-refusal.ts";
import type { AutomationStudioFlowDraftWrittenRepeat } from "./written-repeat.ts";

export function automationStudioFlowDraftSettleWrittenRepeats(steps: readonly AutomationStudioFlowDraftStep[], written: readonly AutomationStudioFlowDraftWrittenRepeat[], shown: AutomationStudioFlowDraftShownNumbering): {
    refused: AutomationStudioFlowDraftAmendmentRefusal[];
    takenBack: number;
} {
    const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
    for (const repeat of written) {
        if (repeat.step.routing !== repeat.routing)
            continue;
        const refusal = automationStudioFlowDraftRepeatRefusal(steps, repeat.step, repeat.routing, repeat.amendment, shown);
        if (!refusal)
            continue;
        if (repeat.previous === undefined)
            delete repeat.step.routing;
        else
            repeat.step.routing = repeat.previous;
        if (repeat.settings === undefined)
            delete repeat.step.settings;
        else
            repeat.step.settings = repeat.settings;
        refused.push(refusal);
    }
    return { refused, takenBack: refused.length };
}
