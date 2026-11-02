import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed } from "../../step/index.ts";
import type { AutomationStudioFlowDraftReach } from "./reach.ts";
import type { Step } from "./step.ts";

export function automationStudioFlowDraftReach(steps: readonly Step[]): AutomationStudioFlowDraftReach {
    const pages = new Map<Step, string | undefined>(steps.map((step) => [step, pageKey(step)] as const));
    const page = (step: Step): string | undefined => pages.get(step) ?? pageKey(step);
    const ran = steps.map((step) => ({ step, n: appendedNumber(step) })).filter((entry): entry is {
        step: Step;
        n: number;
    } => entry.n !== undefined).sort((a, b) => a.n - b.n);
    const leftOn = new Map<Step, string | undefined>();
    ran.forEach((entry, index) => {
        const next = ran.slice(index + 1).find((later) => page(later.step) !== undefined);
        leftOn.set(entry.step, next === undefined ? undefined : page(next.step));
    });
    const leaves = (step: Step): string | undefined => leftOn.get(step);
    const moves = (step: Step): boolean => automationStudioFlowDraftStepIsProposable(step) && page(step) !== undefined && leaves(step) !== undefined && page(step) !== leaves(step);
    const flow = [...steps].sort((a, b) => a.position - b.position).filter(automationStudioFlowDraftStepIsProposed);
    const unreached = new Set<Step>();
    const noWay = new Set<Step>();
    const start = flow[0] === undefined ? undefined : page(flow[0]);
    flow.forEach((step, index) => {
        const at = page(step);
        if (index === 0 || at === undefined)
            return;
        const left = leaves(flow[index - 1]!);
        if (left !== undefined && left !== at)
            unreached.add(step);
        if (at !== start && !flow.some((other) => other !== step && moves(other) && leaves(other) === at))
            noWay.add(step);
    });
    return { flow, unreached, noWay, page, leaves, moves };
}

function appendedNumber(step: Step): number | undefined {
    const match = /^d([0-9]+)$/u.exec(step.id ?? "");
    return match ? Number(match[1]) : undefined;
}

function pageKey(step: Step): string | undefined {
    const from = step.replay?.from;
    return from === undefined ? undefined : canonical(from);
}

function canonical(value: JsonValue): string {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key]!)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
