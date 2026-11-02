import { isAutomationStudioDestructiveActionConsequence } from "../../../../action-permissions/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";
import { automationStudioFlowDraftDeclaresLasting } from "../declares-lasting.ts";
import { automationStudioFlowDraftStepMovedTarget } from "./moved-target.ts";

export function automationStudioFlowDraftStepWithholdsLater(step: AutomationStudioFlowDraftStep, next: AutomationStudioFlowDraftStep | undefined): boolean {
    const declared = step.ranWith && "consequences" in step.ranWith ? step.ranWith.consequences : step.input.consequences;
    if (automationStudioFlowDraftDeclaresLasting(declared) && automationStudioFlowDraftStepMovedTarget(step, next))
        return true;
    const words = Array.isArray(declared) ? declared : typeof declared === "string" ? declared.split(",") : [];
    return words.some((word) => typeof word === "string" && isAutomationStudioDestructiveActionConsequence(word.trim().toLowerCase()));
}
