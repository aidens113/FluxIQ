import type { JsonValue } from "../../../core/index.ts";
import { automationStudioFlowDraftStepCarried } from "./carried-step/index.ts";
import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "./step/index.ts";
type Step = AutomationStudioFlowDraftStep;
export function automationStudioFlowDraftSecondCopy(steps: readonly Step[], step: Step): Step | undefined {
    if (!automationStudioFlowDraftStepIsProposable(step))
        return undefined;
    const ordered = [...steps].sort((a, b) => a.position - b.position);
    return ordered.find((kept) => kept !== step && kept.disposition === "kept" && automationStudioFlowDraftStepIsProposable(kept)
        && kept.actionId === step.actionId && kept.toolId === step.toolId
        && (sameAct(kept, step) || sameRead(ordered, kept, step) || sameCarried(ordered, kept, step)));
}
function sameCarried(ordered: readonly Step[], kept: Step, step: Step): boolean {
    if (!automationStudioFlowDraftStepCarried(kept) && !automationStudioFlowDraftStepCarried({ id: kept.standsFor }))
        return false;
    if (automationStudioFlowDraftStepCarried(step) || canonical(parametersOf(kept)) !== canonical(parametersOf(step)))
        return false;
    const at = ordered.indexOf(step);
    const [from, to] = [ordered.indexOf(kept), at < 0 ? ordered.length : at].sort((a, b) => a - b) as [
        number,
        number
    ];
    return ordered.slice(from + 1, to).some((between) => between.disposition === "kept" && between.effect === "mutate");
}
function parametersOf(step: Step): JsonValue {
    return step.input.parameters ?? null;
}
function sameAct(kept: Step, step: Step): boolean {
    return kept.effect === "mutate" && step.effect === "mutate"
        && canonical(kept.input) === canonical(step.input)
        && (kept.ranWith === undefined ? step.ranWith === undefined : step.ranWith !== undefined && canonical(kept.ranWith) === canonical(step.ranWith))
        && step.stateBefore !== undefined && kept.stateBefore === step.stateBefore;
}
function sameRead(ordered: readonly Step[], kept: Step, step: Step): boolean {
    if (kept.effect !== "observe" || step.effect !== "observe" || step.reads === undefined || kept.reads !== step.reads)
        return false;
    const at = ordered.indexOf(step);
    const [from, to] = [ordered.indexOf(kept), at < 0 ? ordered.length : at].sort((a, b) => a - b) as [
        number,
        number
    ];
    return !ordered.slice(from + 1, to).some((between) => between.disposition === "kept" && between.effect === "mutate");
}
function canonical(value: JsonValue): string {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key]!)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
