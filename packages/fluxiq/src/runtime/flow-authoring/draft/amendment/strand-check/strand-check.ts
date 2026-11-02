import { automationStudioFlowDraftStepIsProposable } from "../../step/index.ts";
import type { AutomationStudioFlowDraftAmendmentRefusal, AutomationStudioFlowDraftUnreachedStep } from "../contracts/index.ts";
import type { AutomationStudioFlowDraftReach } from "../reach/index.ts";
import { automationStudioFlowDraftReach } from "../reach/index.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "../shown-numbering/index.ts";
import type { Step } from "./step.ts";
import type { AutomationStudioFlowDraftWithdrawal } from "./withdrawal.ts";

export function automationStudioFlowDraftStrandCheck(steps: readonly Step[], before: AutomationStudioFlowDraftReach, withdrawn: readonly AutomationStudioFlowDraftWithdrawal[], shown: AutomationStudioFlowDraftShownNumbering): {
    refused: AutomationStudioFlowDraftAmendmentRefusal[];
    takenBack: number;
    unreached: AutomationStudioFlowDraftUnreachedStep[];
} {
    const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
    const wasInFlow = new Set(before.flow);
    let open = withdrawn.filter((entry) => entry.disposition === "kept" && wasInFlow.has(entry.step));
    let now = automationStudioFlowDraftReach(steps);
    for (let changed = true; changed;) {
        changed = false;
        for (const entry of open) {
            if (entry.step.disposition === "kept")
                continue;
            const stranded = strandedBy(entry.step, now, before);
            if (!stranded)
                continue;
            entry.step.disposition = entry.disposition;
            if (entry.settings === undefined)
                delete entry.step.settings;
            else
                entry.step.settings = entry.settings;
            refused.push({ step: entry.named, reason: "strands_a_step", strands: shown.number(stranded) });
            now = automationStudioFlowDraftReach(steps);
            changed = true;
        }
        open = open.filter((entry) => entry.step.disposition !== "kept");
    }
    const unreached: AutomationStudioFlowDraftUnreachedStep[] = [];
    for (const step of now.flow) {
        if (!now.unreached.has(step) || (wasInFlow.has(step) && before.unreached.has(step)))
            continue;
        const index = now.flow.indexOf(step);
        const at = now.page(step);
        const reachedBy = steps.filter((other) => other !== step && automationStudioFlowDraftStepIsProposable(other) && now.moves(other) && now.leaves(other) === at).map((other) => shown.number(other));
        unreached.push({ step: shown.number(step), after: shown.number(now.flow[index - 1]!), reachedBy });
    }
    return { refused, takenBack: refused.length, unreached };
}

function strandedBy(withdrawn: Step, now: AutomationStudioFlowDraftReach, before: AutomationStudioFlowDraftReach): Step | undefined {
    if (!before.moves(withdrawn))
        return undefined;
    const to = before.leaves(withdrawn);
    return now.flow.find((step) => now.noWay.has(step) && !before.noWay.has(step) && now.page(step) === to);
}
