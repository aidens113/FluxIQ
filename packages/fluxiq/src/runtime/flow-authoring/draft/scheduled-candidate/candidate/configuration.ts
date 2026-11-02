import type { AutomationStudioFlowDraftStep } from "../../step/index.ts";

export function configuration(step: AutomationStudioFlowDraftStep): string {
    return JSON.stringify([step.id, step.position, step.actionId, step.toolId, step.input, step.effect, step.proposes, step.disposition, step.routing, step.settings, step.acts, step.routeSignatures]);
}
