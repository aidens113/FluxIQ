// The last look before a part's first lasting step, with no wait in it: the step's own
// target is shown on the page, and the page is the one the step recorded when it has one.
// It asks `visible`, not `exists`: a host answers `exists` for a target matching several
// things, as a row's control does on a list of look-alikes, and `visible` is then `unknown`.
//
// Anything other than a positive answer stops the run there. A step whose target cannot
// be asked about (it names none, or it is bound to a value this run does not hold)
// stops too: a check nobody could make is not a check that passed.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { resolveAutomationNodeParameterValues } from "../../../../../components/automation/index.ts";
import { observeAutomationStudioFacts } from "../../../../../engine/automation/lifecycle-run/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import { automationStudioCompareRouteSignatures, automationStudioNodeRouteSignatures, automationStudioSignRouteState, observeAutomationStudioRouteState } from "../../../../../runtime/automation-host/route-state/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../../runtime/automation-host/index.ts";
import { automationStudioPartControlTarget, automationStudioPartSteps } from "../../../../../runtime/project-parts/index.ts";

/** Why a run stopped before a step, in a closed word; `./outcome.ts` says each in plain words. */
export type ProjectPartRecheckStop = "no_target" | "target_gone" | "not_read" | "other_page";

export async function projectPartRecheck(input: {
  node: AutomationStudioFlowNode;
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined;
  controlKeys: ReadonlySet<string>;
  inputs: Readonly<Record<string, JsonValue>>;
  projectId: string;
  flowId: string;
  signal?: AbortSignal | undefined;
}): Promise<ProjectPartRecheckStop | undefined> {
  const target = targetOf(input.node, input.controlKeys, input.inputs);
  if (!target) return "no_target";
  const context = { inputs: input.inputs, nodeId: input.node.id, ...(input.signal ? { signal: input.signal } : {}) };
  const observed = await observeAutomationStudioFacts({ hostRuntime: input.hostRuntime, groups: [{ key: "target", conditions: [{ fact: "visible", op: "visible", target }] }], context });
  const truth = observed.results.get("target")?.[0]?.truth;
  if (truth === "false") return "target_gone";
  if (truth !== "true") return "not_read";
  const before = automationStudioNodeRouteSignatures(input.node).before;
  if (!before) return undefined;
  const state = await observeAutomationStudioRouteState({ hostRuntime: input.hostRuntime, projectId: input.projectId, flowId: input.flowId, ...(input.signal ? { signal: input.signal } : {}) });
  if (!state.ok) return "not_read";
  const signed = automationStudioSignRouteState(input.hostRuntime, state.state);
  if (!signed.ok) return "not_read";
  return automationStudioCompareRouteSignatures(input.hostRuntime, before, signed.signature).matches ? undefined : "other_page";
}

/** The step's own target with the run's values read into it, or nothing when it names none or holds a value the run does not have. */
function targetOf(node: AutomationStudioFlowNode, controlKeys: ReadonlySet<string>, inputs: Readonly<Record<string, JsonValue>>): JsonObject | undefined {
  const step = automationStudioPartSteps({ nodes: [node], edges: [] })[0];
  const named = step ? automationStudioPartControlTarget(step, controlKeys) : undefined;
  if (!named) return undefined;
  const resolved = resolveAutomationNodeParameterValues({ target: named }, { ...inputs });
  const target = resolved.values.target;
  return resolved.missingPaths.length === 0 && target && typeof target === "object" && !Array.isArray(target) ? target : undefined;
}
