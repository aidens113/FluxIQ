import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
export function automationStudioFlowDraftSetRoutePlaces(step: AutomationStudioFlowDraftStep, value: string): boolean {
    const named = value === "none" ? [] : [...new Set(value.split(","))].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
    const before = step.places ?? [];
    if (named.length === before.length && named.every((place, index) => place === before[index]))
        return false;
    if (named.length)
        step.places = named;
    else
        delete step.places;
    return true;
}
