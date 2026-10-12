// The fact gate on a state route's target (state-aware recovery plan, C6
// "Safe state routing"; C2 checkpoints; C9 fact conditions).
//
// This module owns which matched nodes the page's facts allow a run to go on
// at, asked of the host in one batched observation per routing decision:
//
// - A graph that declares recovery checkpoints (`fluxiq.checkpoint` node
//   metadata) allows only its checkpoints, and a checkpoint only when every
//   condition of its `when` answers `true`.
// - A graph that declares none allows a node whose `readyState` is written as
//   fact conditions only when they all answer `true`: closeness alone does not
//   qualify it. A node whose ready state holds no fact conditions (none, or the
//   readiness gate's expectation form) is not gated here.
//
// `unknown` is never `true`: a host without fact evaluation, a malformed
// condition, or an unsettled answer refuses the node.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioFactEvaluationContext, AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import type { AutomationStudioStateRouteRefusalGuard } from "../contracts.ts";
import {
  automationStudioFactConditionsHold,
  automationStudioSubflowContract,
  parseAutomationStudioFactConditions,
  type AutomationStudioFactCondition,
  type AutomationStudioFactTruth
} from "../lifecycle/index.ts";
import { observeAutomationStudioFacts, type AutomationStudioFactObservationGroup } from "../lifecycle-run/index.ts";
import { automationStudioNodeReadinessState } from "../recorded-state.ts";

/** The guards this gate refuses with. */
export type AutomationStudioStateRouteFactGuard = Extract<AutomationStudioStateRouteRefusalGuard, "not_checkpoint" | "checkpoint_when_not_true" | "ready_state_not_true">;

/** Why the gate refused one node: the guard, and what its conditions answered (absent for `not_checkpoint`, which asks nothing). */
export type AutomationStudioStateRouteFactRefusal = { guard: AutomationStudioStateRouteFactGuard; truth?: Exclude<AutomationStudioFactTruth, "true"> };

/** What the gate decided for a set of nodes: each refused node's refusal, and how many host calls it made (0 or 1). */
export type AutomationStudioStateRouteFactGate = { refused: ReadonlyMap<string, AutomationStudioStateRouteFactRefusal>; calls: 0 | 1 };

/** The conditions one node must meet, or `not_checkpoint`. Absent from the plan when the node is not gated. */
type NodeGate = { guard: "not_checkpoint" } | { guard: "checkpoint_when_not_true" | "ready_state_not_true"; conditions: readonly (AutomationStudioFactCondition | JsonValue)[] };

/**
 * Gates `nodeIds` (matched candidates, in any order) against the page's facts,
 * in at most one host call. No call is made when no node has a condition to
 * ask. A node absent from `refused` is allowed by this gate.
 */
export async function automationStudioStateRouteFactGate(input: {
  flow: AutomationStudioFlowDocument;
  nodeIds: readonly string[];
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined;
  context: AutomationStudioFactEvaluationContext;
}): Promise<AutomationStudioStateRouteFactGate> {
  const plan = nodeGates(input.flow);
  const refused = new Map<string, AutomationStudioStateRouteFactRefusal>();
  const groups: AutomationStudioFactObservationGroup[] = [];
  for (const nodeId of new Set(input.nodeIds)) {
    const gate = plan.get(nodeId);
    if (!gate) continue;
    if (gate.guard === "not_checkpoint") refused.set(nodeId, { guard: "not_checkpoint" });
    else groups.push({ key: nodeId, conditions: gate.conditions });
  }
  const observation = await observeAutomationStudioFacts({ hostRuntime: input.hostRuntime, groups, context: input.context });
  for (const group of groups) {
    const gate = plan.get(group.key) as Exclude<NodeGate, { guard: "not_checkpoint" }>;
    const truth = holds(group.conditions, observation.results.get(group.key) ?? []);
    if (truth !== "true") refused.set(group.key, { guard: gate.guard, truth });
  }
  return { refused, calls: observation.calls };
}

/**
 * Every gated node of the graph. A graph declares checkpoints when any node
 * carries `fluxiq.checkpoint` metadata, even one that could not be read: then
 * every node that is not a readable checkpoint is `not_checkpoint`, and a
 * checkpoint whose declaration had a problem is asked a condition that cannot
 * be sent, so it answers `unknown` and is refused, never loosened by a dropped
 * condition.
 */
function nodeGates(flow: AutomationStudioFlowDocument): Map<string, NodeGate> {
  const key = AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.checkpoint;
  const gates = new Map<string, NodeGate>();
  if (flow.nodes.some((node) => node.metadata?.[key] !== undefined)) {
    const contract = automationStudioSubflowContract(flow);
    for (const node of flow.nodes) gates.set(node.id, { guard: "not_checkpoint" });
    for (const checkpoint of contract.checkpoints) {
      const path = `nodes.${checkpoint.nodeId}.metadata.${key}`;
      const malformed = contract.problems.some((problem) => problem.startsWith(path));
      gates.set(checkpoint.nodeId, { guard: "checkpoint_when_not_true", conditions: malformed ? [...checkpoint.when, UNREADABLE] : checkpoint.when });
    }
    return gates;
  }
  for (const node of flow.nodes) {
    const conditions = factReadyState(node);
    if (conditions) gates.set(node.id, { guard: "ready_state_not_true", conditions });
  }
  return gates;
}

/** A condition that is never sent and always answers `unknown` (`core:malformed`). */
const UNREADABLE: JsonValue = { unreadable: true };

/** A node's ready state as fact conditions, when it is written wholly as them; otherwise it is the readiness gate's, and not gated here. */
function factReadyState(node: AutomationStudioFlowDocument["nodes"][number]): AutomationStudioFactCondition[] | undefined {
  const readyState = automationStudioNodeReadinessState(node);
  if (!readyState) return undefined;
  const parsed = parseAutomationStudioFactConditions(Array.isArray(readyState.conditions) ? readyState.conditions : [readyState], "readyState");
  return parsed.problems.length || !parsed.conditions.length ? undefined : parsed.conditions;
}

/** All-true over the answers; the sent list may hold an unreadable marker, which answered `unknown`. */
function holds(conditions: readonly (AutomationStudioFactCondition | JsonValue)[], results: Parameters<typeof automationStudioFactConditionsHold>[1]): AutomationStudioFactTruth {
  return automationStudioFactConditionsHold(conditions as readonly AutomationStudioFactCondition[], results);
}
