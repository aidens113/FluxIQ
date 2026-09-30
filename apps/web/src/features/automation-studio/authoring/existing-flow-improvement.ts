import type { BlankFlowAuthoringReadiness } from "./blank-flow-authoring-model";
import { flowModelBinding, isEmptyOrchestrationParent } from "./flow-model-binding";

/**
 * Improving a Flow that already exists, from what a person says should change.
 *
 * The request is the website exploration's, because an improvement is one: the
 * model opens the page, sees the situation the Flow does not handle, and amends
 * the Flow's own steps. What differs is the Flow it accepts, and that mirrors
 * Core's `extend` rule word for word (`runtime/flow-bootstrap/extend.ts`,
 * `automationStudioBootstrapTargetRefusal`): a top-level orchestration Flow
 * whose own graph is empty, that already has a Router and at least one
 * Subflow. A Flow with none of those is a creation's subject, and the build
 * panel offers that instead.
 *
 * No active instruction is required beforehand: the person's words are saved
 * as one immediately before the build, and the Flow's existing instructions
 * stay in force beside it.
 */
export function existingFlowImprovementRequest(projectId: string | null, flow: any, readiness: BlankFlowAuthoringReadiness): { ok: true; payload: { projectId: string; flowId: string } } | { ok: false } {
  if (readiness.loading || readiness.error || !readiness.router || readiness.subflowTotal < 1 || !isEmptyOrchestrationParent(flow)) return { ok: false };
  const base = flowModelBinding(projectId, flow);
  return base.ok ? { ok: true, payload: base.payload } : { ok: false };
}

/** The longest improvement Core stores as one instruction body. */
export const IMPROVEMENT_INSTRUCTION_MAX_LENGTH = 4_000;

/**
 * What a person said should change, as the instruction Core stores: required,
 * tagged for generation, and titled by its opening words so the Instructions
 * view reads as the list of things this Flow was asked to do.
 */
export function improvementInstruction(text: string): { title: string; body: string; requirement: "required"; tags: ["generation"] } {
  const body = text.trim();
  const firstLine = body.split(/\r?\n/u)[0] ?? "";
  const sentence = firstLine.split(/(?<=[.!?])\s/u)[0] ?? firstLine;
  const opening = sentence.length > 70 ? `${sentence.slice(0, 67).trimEnd()}...` : sentence;
  return { title: `Improvement: ${opening}`, body, requirement: "required", tags: ["generation"] };
}
