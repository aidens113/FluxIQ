import {
  CLIENT_GATEWAY_ACTIVITY_RECOVERY_EVENTS,
  CLIENT_GATEWAY_ACTIVITY_RECOVERY_KINDS,
  CLIENT_GATEWAY_ACTIVITY_RECOVERY_OUTCOMES,
  CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS
} from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioActivityInput } from "./contracts.ts";
import { AUTOMATION_STUDIO_ACTIVITY_LIMITS } from "./limits.ts";

type Detail = NonNullable<AutomationStudioActivityInput["detail"]>;

const RESOLUTIONS: ReadonlySet<string> = new Set(CLIENT_GATEWAY_ACTIVITY_RESOLUTIONS);
const RECOVERY_KINDS: ReadonlySet<unknown> = new Set(CLIENT_GATEWAY_ACTIVITY_RECOVERY_KINDS);
const RECOVERY_OUTCOMES: ReadonlySet<unknown> = new Set(CLIENT_GATEWAY_ACTIVITY_RECOVERY_OUTCOMES);
const RECOVERY_EVENTS: ReadonlySet<unknown> = new Set(CLIENT_GATEWAY_ACTIVITY_RECOVERY_EVENTS);
/** An id a recovery may lead to: no whitespace, at most 200 characters. */
const TARGET_ID = /^[^\s]{1,200}$/u;

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

type Recovery = NonNullable<Detail["recovery"]>;

/**
 * A `step` row's recovery with its subject cut to the title's bound, or
 * `undefined` when a closed field is outside the contract or the subject is
 * empty. `event` is kept only on a `handler` recovery, and `targetId` only
 * when it is id-shaped.
 */
function boundedRecovery(recovery: Recovery): Recovery | undefined {
  const subject = typeof recovery.subject === "string" ? recovery.subject.trim() : "";
  if (!RECOVERY_KINDS.has(recovery.kind) || !RECOVERY_OUTCOMES.has(recovery.outcome) || !subject) return undefined;
  const event = recovery.kind === "handler" && RECOVERY_EVENTS.has(recovery.event) ? recovery.event : undefined;
  const targetId = typeof recovery.targetId === "string" && TARGET_ID.test(recovery.targetId) ? recovery.targetId : undefined;
  return {
    kind: recovery.kind,
    subject: clip(subject, AUTOMATION_STUDIO_ACTIVITY_LIMITS.title),
    outcome: recovery.outcome,
    ...(event === undefined ? {} : { event }),
    ...(targetId === undefined ? {} : { targetId })
  };
}

/**
 * The detail row with its strings cut to their bounds, and a `resolution`
 * kept only when the contract names it and the row is an `ask`: it says how a
 * wait on the person ended, and no other row carries one. Likewise a
 * `recovery` is kept only on a `step` row, and only in the contract's shape.
 */
function boundedDetail(detail: Detail): Detail {
  const limits = AUTOMATION_STUDIO_ACTIVITY_LIMITS;
  const { resolution, recovery, ...rest } = detail;
  const kept = resolution !== undefined && detail.kind === "ask" && RESOLUTIONS.has(resolution);
  const recovered = recovery !== undefined && detail.kind === "step" ? boundedRecovery(recovery) : undefined;
  return {
    ...rest,
    title: clip(detail.title, limits.title),
    ...(detail.text === undefined ? {} : { text: clip(detail.text, limits.text) }),
    ...(kept ? { resolution } : {}),
    ...(recovered ? { recovery: recovered } : {})
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
