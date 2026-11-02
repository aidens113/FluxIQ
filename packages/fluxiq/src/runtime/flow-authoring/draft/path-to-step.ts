import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step/index.ts";
export function automationStudioFlowDraftPathToStep(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
    if (step.stateBefore === undefined)
        return [];
    const earlier = steps.filter((candidate) => candidate !== step && candidate.iteration < step.iteration).sort((a, b) => b.iteration - a.iteration);
    const way: AutomationStudioFlowDraftStep[] = [];
    let from: AutomationStudioFlowDraftStep | undefined;
    for (const candidate of earlier) {
        if (!automationStudioFlowDraftStepIsProposable(candidate))
            continue;
        if (candidate.disposition === "kept") {
            from = candidate;
            break;
        }
        if (candidate.effect === "observe")
            continue;
        if (candidate.stateBefore === undefined || candidate.stateAfter === undefined || candidate.stateBefore === candidate.stateAfter)
            continue;
        if (candidate.disposition !== "taken")
            break;
        way.unshift(candidate);
    }
    return withoutDetours(way, from, step);
}
function withoutDetours(way: readonly AutomationStudioFlowDraftStep[], from: AutomationStudioFlowDraftStep | undefined, step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftStep[] {
    const moment = (...states: Array<string | undefined>): Set<string> => new Set(states.filter((state): state is string => state !== undefined));
    const moments: Set<string>[] = [moment(from?.stateAfter, way[0]?.stateBefore ?? step.stateBefore)];
    const kept: AutomationStudioFlowDraftStep[] = [];
    way.forEach((current, index) => {
        const reached = moment(current.stateAfter, (way[index + 1] ?? step).stateBefore);
        const seen = moments.findIndex((earlier) => [...reached].some((state) => earlier.has(state)));
        if (seen === -1) {
            kept.push(current);
            moments.push(reached);
            return;
        }
        kept.length = seen;
        moments.length = seen + 1;
    });
    return kept;
}
