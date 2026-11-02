import { automationStudioFlowDraftStepId } from "./routing/index.ts";
import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step/index.ts";
export function automationStudioFlowDraftDropReversals(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftStep[] {
    const ordered = [...steps].sort((a, b) => a.position - b.position);
    const out: AutomationStudioFlowDraftStep[] = [];
    for (const later of ordered) {
        const toggle = later.toggle;
        if (!toggle || later.disposition !== "kept" || later.cancels !== undefined || later.routing !== undefined)
            continue;
        if (!automationStudioFlowDraftStepIsProposable(later))
            continue;
        const earlier = partnerOf(ordered, later, toggle.key);
        if (!earlier || earlier.toggle?.to === toggle.to)
            continue;
        if (earlier.disposition === "kept") {
            if (earlier.cancels !== undefined || earlier.routing !== undefined)
                continue;
            if (ordered.slice(ordered.indexOf(earlier) + 1, ordered.indexOf(later))
                .some((step) => step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step)))
                continue;
            takeOut(earlier, later);
            takeOut(later, earlier);
            out.push(earlier, later);
            continue;
        }
        takeOut(later, earlier);
        out.push(later);
    }
    return out;
}
function partnerOf(ordered: readonly AutomationStudioFlowDraftStep[], later: AutomationStudioFlowDraftStep, key: string): AutomationStudioFlowDraftStep | undefined {
    for (let index = ordered.indexOf(later) - 1; index >= 0; index -= 1) {
        const candidate = ordered[index]!;
        if (candidate.toggle?.key !== key || !automationStudioFlowDraftStepIsProposable(candidate))
            continue;
        if (candidate.cancels !== undefined && candidate.disposition !== "kept")
            continue;
        return candidate;
    }
    return undefined;
}
function takeOut(step: AutomationStudioFlowDraftStep, partner: AutomationStudioFlowDraftStep): void {
    step.disposition = "dropped";
    step.cancels = automationStudioFlowDraftStepId(partner);
    delete step.acts;
}
