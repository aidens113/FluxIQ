// How the `step_parameters` section gets smaller without losing the failing
// step's parameters.
//
// The first rung loses nothing. The parameters a step carries are the Flow's
// authored ones joined by node id (`../repair-context/step-parameters.ts`), so a
// node that appears twice in the chain carries the same object twice -- and a
// refuted result always does, because its synthetic attempt names the node the
// answer came out of (`../refuted-result/attempt.ts`). Each node's parameters
// are kept on its latest step and the earlier steps point at it.
//
// After that, the steps that did not fail give up what the repair needs least,
// in order: their label and output shape; then their parameters (said, not
// silently absent), except on steps of the failing step's own definition, which
// go last -- a wrong-answer extraction is repaired by comparing it with the
// extraction beside it that filtered, and in `run-munnhi5q-4867dabe` that is
// exactly the pair (s9, s11); then everything but identity. The failing node's
// steps keep their parameters through every rung, which is the point of the
// ladder.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioCappedProse } from "./prose-cap.ts";
import type { AutomationStudioRecoverySectionTrim } from "./trim-step.ts";

const PARAMETER_KEYS = ["parameters", "parametersWithheld"] as const;
const IDENTITY_KEYS = ["order", "nodeId", "definitionId", "status", "route", "recordCount", "failureCategory", "failureCode", "parametersAtOrder", "parametersTrimmed"] as const;

export const AUTOMATION_STUDIO_RECOVERY_STEP_TRIMS: readonly AutomationStudioRecoverySectionTrim[] = Object.freeze([
  withParametersOncePerNode,
  (section) => automationStudioCappedProse(section, 240),
  (section, failedNodeId) => mappedSteps(section, failedNodeId, (step) => omit(step, ["label", "outputShape", "durationMs", "comparisonStatus"])),
  (section, failedNodeId) => mappedSteps(section, failedNodeId, (step) => step.definitionId === failingDefinition(section, failedNodeId) ? step : withoutParameters(step)),
  (section) => automationStudioCappedProse(section, 120),
  (section, failedNodeId) => mappedSteps(section, failedNodeId, withoutParameters),
  (section, failedNodeId) => mappedSteps(section, failedNodeId, (step) => pick(step, IDENTITY_KEYS))
]);

/** Each node's parameters on its latest step only; an earlier step of the same node names the order that carries them. */
function withParametersOncePerNode(section: JsonObject): JsonObject {
  const steps = stepsOf(section);
  const latest = new Map<string, number>();
  steps.forEach((step, index) => { if (typeof step.nodeId === "string") latest.set(step.nodeId, index); });
  return {
    ...section,
    steps: steps.map((step, index) => {
      const carrier = typeof step.nodeId === "string" ? latest.get(step.nodeId) : undefined;
      if (carrier === undefined || carrier === index || !PARAMETER_KEYS.some((key) => step[key] !== undefined)) return step;
      return { ...omit(step, PARAMETER_KEYS), parametersAtOrder: steps[carrier]!.order ?? null };
    })
  };
}

/** A step's parameters removed, and said to have been, so an absent key never reads as a step that took none. */
function withoutParameters(step: JsonObject): JsonObject {
  return PARAMETER_KEYS.some((key) => step[key] !== undefined) ? { ...omit(step, [...PARAMETER_KEYS, "parametersAtOrder"]), parametersTrimmed: true } : step;
}

/** The failing node's definition, whose other steps are the nearest comparison a repair has. */
function failingDefinition(section: JsonObject, failedNodeId: string | undefined): JsonValue | undefined {
  return stepsOf(section).find((step) => step.nodeId === failedNodeId)?.definitionId;
}

/** Applies `map` to every step that is not the failing node's. */
function mappedSteps(section: JsonObject, failedNodeId: string | undefined, map: (step: JsonObject) => JsonObject): JsonObject {
  return { ...section, steps: stepsOf(section).map((step) => step.nodeId === failedNodeId ? step : map(step)) };
}

function stepsOf(section: JsonObject): JsonObject[] {
  const steps = section.steps;
  return Array.isArray(steps) ? steps.filter((step): step is JsonObject => Boolean(step) && typeof step === "object" && !Array.isArray(step)) : [];
}

function omit(record: JsonObject, keys: readonly string[]): JsonObject {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key))) as JsonObject;
}

function pick(record: JsonObject, keys: readonly string[]): JsonObject {
  return Object.fromEntries(Object.entries(record).filter(([key]) => keys.includes(key))) as Record<string, JsonValue> as JsonObject;
}
