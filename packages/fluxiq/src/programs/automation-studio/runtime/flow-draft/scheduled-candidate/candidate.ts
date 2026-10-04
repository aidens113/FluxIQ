import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

/** An unchanged saved configuration awaiting a fresh test, never performed proof. */
export type AutomationStudioFlowDraftScheduledCandidate = { readonly sourceNodeId: string };

type Held = { candidate: AutomationStudioFlowDraftScheduledCandidate; configuration: string; input: JsonObject; from: JsonObject };
const held = new WeakMap<AutomationStudioFlowDraftStep, Held>();

/** Minted only while reading an actual saved node and its captured start. */
export function automationStudioFlowDraftScheduleCandidate(step: AutomationStudioFlowDraftStep, sourceNodeId: string, from: JsonObject | undefined): void {
  const declarations = step.input.consequences;
  if (!from || !sourceNodeId || !Array.isArray(declarations) || !declarations.every((value) => typeof value === "string")) return;
  const candidate = Object.freeze({ sourceNodeId });
  step.scheduledCandidate = candidate;
  held.set(step, { candidate, configuration: configuration(step), input: structuredClone(step.input), from: structuredClone(from) });
}

/** Only the loop's trusted initial seed copy transfers correspondence. */
export function automationStudioFlowDraftCopyScheduledCandidate(source: AutomationStudioFlowDraftStep, copy: AutomationStudioFlowDraftStep): void {
  const original = read(source);
  if (!original || configuration({ ...copy, position: source.position }) !== original.configuration) return;
  held.set(copy, { ...original, configuration: configuration(copy) });
}

/** Fresh values for a current unchanged candidate, without historical execution claims. */
export function automationStudioFlowDraftScheduledCandidateCall(step: AutomationStudioFlowDraftStep): { input: JsonObject; from: JsonObject } | undefined {
  const value = read(step);
  return value ? { input: structuredClone(value.input), from: structuredClone(value.from) } : undefined;
}

function read(step: AutomationStudioFlowDraftStep): Held | undefined {
  const value = held.get(step);
  if (step.ranWith !== undefined || step.replay !== undefined || step.effectApplied !== undefined || step.checkedCandidate !== undefined || step.priorExecution !== undefined) return undefined;
  return value && step.scheduledCandidate === value.candidate && configuration(step) === value.configuration ? value : undefined;
}

function configuration(step: AutomationStudioFlowDraftStep): string {
  return JSON.stringify([step.id, step.position, step.actionId, step.toolId, step.input, step.effect, step.proposes, step.disposition, step.routing, step.settings, step.acts, step.routeSignatures]);
}
