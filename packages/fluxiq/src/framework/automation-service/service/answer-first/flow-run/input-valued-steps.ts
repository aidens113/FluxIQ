// A saved Flow's steps with this attempt's input values as their bindings' defaults, for the rounds
// that repair it (fluxnode-plan N2). A step bound to an input (`./input-bound-steps.ts`) holds the
// value it was learned with as its default, `{"$state":{"path":<name>,"fallback":<value>}}`. The
// engine's run resolves the binding against the run's inputs (`./flow-run.ts`), but a round that runs
// saved steps again (`core.run_flow`, its forward run) resolves them against no inputs, so each would
// take its default: the value the Flow was learned with, not this run's.
//
// So before the rounds start, each binding to an input this attempt has a value for takes that value
// as its default, in what the step runs with and in what it was written with. Nothing else changes:
// a binding to a row or to an earlier step, a binding to an input this attempt has no value for, and
// every fixed value stay as they were. No model reads them, and a step with none comes back as it was.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationNodeStateBinding, isAutomationNodeParameterStateBinding } from "../../../nodes/index.ts";

/** As deep as the executor resolves a binding. */
const MOST_DEPTH = 16;

export function automationStudioAnswerFirstInputValuedSteps(steps: readonly AutomationStudioFlowDraftStep[], inputs: Readonly<Record<string, JsonValue>> | undefined): AutomationStudioFlowDraftStep[] {
  if (!inputs || Object.keys(inputs).length === 0) return [...steps];
  return steps.map((step) => {
    const input = valuedCall(step.input, inputs);
    const ranWith = step.ranWith === undefined ? undefined : valuedCall(step.ranWith, inputs);
    if (input === step.input && ranWith === step.ranWith) return step;
    return { ...step, input, ...(ranWith === undefined ? {} : { ranWith }) };
  });
}

function valuedCall(call: JsonObject, inputs: Readonly<Record<string, JsonValue>>): JsonObject {
  const parameters = call.parameters;
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) return call;
  const valued = valuedOf(parameters, inputs, 1);
  return valued === parameters ? call : { ...call, parameters: valued };
}

function valuedOf(value: JsonValue, inputs: Readonly<Record<string, JsonValue>>, depth: number): JsonValue {
  if (depth > MOST_DEPTH) return value;
  if (isAutomationNodeParameterStateBinding(value)) {
    const { path } = value.$state;
    const given = Object.hasOwn(inputs, path) ? inputs[path] : undefined;
    return given === undefined ? value : automationNodeStateBinding(path, structuredClone(given)) as unknown as JsonValue;
  }
  if (Array.isArray(value)) {
    const valued = value.map((item) => valuedOf(item, inputs, depth + 1));
    return valued.some((item, index) => item !== value[index]) ? valued : value;
  }
  if (value !== null && typeof value === "object") {
    let changed = false;
    const valued: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      const next = valuedOf(item, inputs, depth + 1);
      if (next !== item) changed = true;
      valued[key] = next;
    }
    return changed ? valued : value;
  }
  return value;
}
