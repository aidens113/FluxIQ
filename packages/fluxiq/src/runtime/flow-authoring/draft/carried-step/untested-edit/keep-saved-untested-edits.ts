import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepId } from "../../routing/index.ts";
import { automationStudioFlowDraftSavedInput } from "../../scheduled-candidate/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../step/index.ts";
import { automationStudioFlowDraftStepCarried } from "../carried-step/index.ts";
import type { AutomationStudioFlowDraftKeptSaved } from "./kept-saved.ts";

const PASSED: ReadonlySet<string> = new Set(["replayed", "verified", "present"]);

export function automationStudioFlowDraftKeepSavedUntestedEdits(input: {
    steps: AutomationStudioFlowDraftStep[];
    saved: readonly AutomationStudioFlowDraftStep[];
    describe?: ((call: {
        toolId: string;
        value: JsonObject;
    }) => unknown) | undefined;
}): AutomationStudioFlowDraftKeptSaved[] {
    const kept: AutomationStudioFlowDraftKeptSaved[] = [];
    input.steps.forEach((step, index) => {
        if (!automationStudioFlowDraftStepIsProposed(step) || (step.routing?.kind !== "optional" && step.interruption !== true))
            return;
        const savedId = step.standsFor ?? automationStudioFlowDraftStepId(step);
        const original = input.saved.find((each) => each.id === savedId && automationStudioFlowDraftStepCarried(each));
        const savedInput = original ? automationStudioFlowDraftSavedInput(original) : undefined;
        if (!original || !savedInput)
            return;
        const changed = step.id !== original.id || step.ranWith !== undefined || canonical(step.input) !== canonical(savedInput);
        if (!changed || PASSED.has(step.replayed?.status ?? ""))
            return;
        const restored: AutomationStudioFlowDraftStep = { ...structuredClone(original), input: savedInput, position: step.position };
        input.steps[index] = restored;
        kept.push({ position: step.position, said: keptSaid(named(input.describe, original.toolId ?? original.actionId, savedInput) ?? `step ${step.position}`, step.replayed?.resultCode !== undefined) });
    });
    return kept;
}

function keptSaid(name: string, tried: boolean): string {
    return `Kept the saved version of ${name}; the change could not be tested because ${tried ? "the notice it is for did not appear when the Flow was tested" : "the test had no way to run the changed step"}.`;
}

function named(describe: ((call: {
    toolId: string;
    value: JsonObject;
}) => unknown) | undefined, toolId: string, value: JsonObject): string | undefined {
    const answer: unknown = describe?.({ toolId, value });
    const target = answer && typeof answer === "object" && !Array.isArray(answer) ? (answer as {
        target?: unknown;
    }).target : undefined;
    return typeof target === "string" && target.trim() ? `"${target.trim().slice(0, 120)}"` : undefined;
}

function canonical(value: JsonValue): string {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (!value || typeof value !== "object")
        return JSON.stringify(value);
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as JsonObject)[key] as JsonValue)}`).join(",")}}`;
}
