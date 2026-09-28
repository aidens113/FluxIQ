import type { AutomationStudioActionConsequence } from "./action-consequence";

/**
 * The complete set of consequences that may ask a person for their security
 * PIN. Nothing is added here because a control felt important, because a model
 * might be wrong, or because an operation is unusual: the test is whether the
 * person loses something irreversibly or money moves.
 *
 * FluxIQ Core enforces the same line server side. `GlobalProgramApiRegistry`
 * (packages/fluxiq/src/programs/_shared/api.ts) runs `authorizeProgramPin` only
 * for endpoints registered with `classification: "destructive"`; every
 * `authoring` endpoint - create project, save flow, save settings, save an
 * instruction, enable/disable/archive a subflow, generate a subflow from a
 * recording - accepts the call without a PIN. A prompt in front of one of those
 * is panel-side ceremony that buys no safety at all.
 */
export const AUTOMATION_STUDIO_PIN_GATED_CONSEQUENCES: readonly AutomationStudioActionConsequence[] = [
  "delete",
  "checkout",
  "payment"
];

/**
 * True only for the consequences above. A caller that cannot name its action as
 * one of those is doing routine work and must proceed without asking.
 */
export function automationStudioActionRequiresPin(consequence: AutomationStudioActionConsequence): boolean {
  return AUTOMATION_STUDIO_PIN_GATED_CONSEQUENCES.includes(consequence);
}
