import type { AutomationStudioActivityInput } from "./contracts.ts";
import { AUTOMATION_STUDIO_ACTIVITY_LIMITS } from "./limits.ts";

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * The event with every string cut to its bound. Only the strings the contract
 * bounds are touched (the step's authored label is held to the title's bound);
 * ids pass through as the emission site wrote them.
 */
export function boundedAutomationStudioActivity(input: AutomationStudioActivityInput): AutomationStudioActivityInput {
  const limits = AUTOMATION_STUDIO_ACTIVITY_LIMITS;
  return {
    ...input,
    label: clip(input.label, limits.label),
    ...(input.step ? { step: { ...input.step, ...(input.step.label === undefined ? {} : { label: clip(input.step.label, limits.title) }) } } : {}),
    ...(input.detail ? { detail: { ...input.detail, title: clip(input.detail.title, limits.title), ...(input.detail.text === undefined ? {} : { text: clip(input.detail.text, limits.text) }) } } : {})
  };
}
