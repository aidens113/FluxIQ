import { CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioActivityInput } from "./contracts.ts";
import { AUTOMATION_STUDIO_ACTIVITY_LIMITS } from "./limits.ts";

type Detail = NonNullable<AutomationStudioActivityInput["detail"]>;

const RESOLUTIONS: ReadonlySet<string> = new Set(CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS);

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * The detail row with its strings cut to their bounds, and a `resolution`
 * kept only when the contract names it and the row is an `ask`: it says how a
 * wait on the person ended, and no other row carries one.
 */
function boundedDetail(detail: Detail): Detail {
  const limits = AUTOMATION_STUDIO_ACTIVITY_LIMITS;
  const { resolution, ...rest } = detail;
  const kept = resolution !== undefined && detail.kind === "ask" && RESOLUTIONS.has(resolution);
  return {
    ...rest,
    title: clip(detail.title, limits.title),
    ...(detail.text === undefined ? {} : { text: clip(detail.text, limits.text) }),
    ...(kept ? { resolution } : {})
  };
}

type Step = NonNullable<AutomationStudioActivityInput["step"]>;

/** The step with its authored label and its row (`./step/started.ts`) cut to the title's bound. */
function boundedStep(step: Step): Step {
  const limits = AUTOMATION_STUDIO_ACTIVITY_LIMITS;
  return {
    ...step,
    ...(step.label === undefined ? {} : { label: clip(step.label, limits.title) }),
    ...(step.row === undefined ? {} : { row: clip(step.row, limits.title) })
  };
}

/**
 * The event with every string cut to its bound. Only the strings the contract
 * bounds are touched (the step's authored label, and the row a list loop's
 * pass is on, are held to the title's bound); ids pass through as the emission
 * site wrote them.
 */
export function boundedAutomationStudioActivity(input: AutomationStudioActivityInput): AutomationStudioActivityInput {
  const limits = AUTOMATION_STUDIO_ACTIVITY_LIMITS;
  return {
    ...input,
    label: clip(input.label, limits.label),
    ...(input.step ? { step: boundedStep(input.step) } : {}),
    ...(input.detail ? { detail: boundedDetail(input.detail) } : {})
  };
}
