// A layer the build closed while exploring becomes a handler of the submitted
// Flow (t787 fix 1 of `run-mvskptb1-c9cef4fe`). Mechanical: the model writes
// nothing.
//
// The build met a layer over the page, pressed its way out, and the site
// remembered: no trial met the layer again, so the model wrote no step for it,
// and playback on a fresh account met it and failed. The domain says which
// presses cleared such a layer (`../explored-interruptions.ts`), and each one
// the submitted Flow has no step of its own for becomes the handler Core writes
// for a layer that got in the way (`./patch.ts`), lowered into
// every part of the plan but the recovery one:
//
// - scope: the part it sits in, not the parts it calls, which have their own;
//   so a subflow brief's proposal carries it whichever part it builds.
// - `when` the control the press used is shown, and done once it is not: the
//   domain reports only a press after which its control was no longer shown,
//   so the control showing is the layer being there. Its target is the
//   parameters the domain ran the press with, the durable target in the
//   host's own form that a fact's target is resolved to (C9); Core never reads
//   inside it.
// - one step: that press again, with those parameters, declaring nothing
//   lasting, as the explored press declared.
// - then carry on.
//
// A press a step of the plan already makes is the model's own answer and is
// left to it: the same node naming one of the press's handles
// (`handleViews`), or the same resolved target, compared whole. Nothing is
// added to a part that would then hold more nodes than the Flow allows, and a
// plan that would then fail validation keeps none: the handler never costs a
// submission that was valid without it.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioExploredInterruption } from "../explored-interruptions.ts";
import { derivedOutputActionId } from "../authoring/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapNode,
  type AutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapSizeLimits,
  type AutomationStudioFlowBootstrapSubflow,
  type AutomationStudioFlowBuildPlan
} from "../plan/index.ts";
import { automationStudioFlowBootstrapSubflowRequires } from "../script-statements/index.ts";
import { automationStudioLayerHandlerPatch } from "./patch.ts";

/** What the handler's nodes are called, in the chat and the editor: generic words, never the page's. */
const WORDS = {
  registration: "Something covered the page",
  press: "Close what covered the page",
  end: "Then carry on",
  reason: "While gathering evidence the build closed something that covered the page, and the site may remember that it was closed. When it is there again, the Flow closes it the same way and carries on."
} as const;

/** What every handler made here says it came from. */
const LEARNED_FROM = "exploration_close";

/** How many nodes one handler adds to a part: its registration, its press and its end. */
const HANDLER_NODES = 3;

/** The build plan with a handler for each explored cleared layer the plan has no step for (header); the plan as given when there is none. */
export function automationStudioCandidateExploredLayerHandlers(input: {
  buildPlan: AutomationStudioFlowBuildPlan;
  /** Which handle each node was resolved from, the node named `<subflow key>.<node key>`. */
  handleViews?: readonly { node: string; handle: string }[] | undefined;
  explored: readonly AutomationStudioExploredInterruption[];
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  size?: AutomationStudioFlowBootstrapSizeLimits | undefined;
}): AutomationStudioFlowBuildPlan {
  const ids = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS;
  const handler = input.registry.get(ids.handler, input.resolution);
  const end = input.registry.get(ids.handlerEnd, input.resolution);
  const presses = unanswered(input.buildPlan.plan, input.explored, input.handleViews ?? []);
  if (!handler || !end || !presses.length) return input.buildPlan;
  const plan = structuredClone(input.buildPlan.plan);
  const most = input.size?.maxNodesPerSubflow ?? Number.POSITIVE_INFINITY;
  let added = 0;
  for (const press of presses) {
    const definition = input.registry.get(press.node, input.resolution);
    if (!definition) continue;
    for (const subflow of plan.subflows) {
      if (subflow.role === "recovery" || subflow.nodes.length + HANDLER_NODES > most) continue;
      lower(subflow, press, { handler, end, press: definition });
      added += 1;
    }
  }
  if (!added) return input.buildPlan;
  const requires = new Set<string>();
  for (const subflow of plan.subflows) {
    const own = automationStudioFlowBootstrapSubflowRequires(subflow);
    own.forEach((id) => requires.add(id));
    if (own.length) subflow.metadata = { ...subflow.metadata, requires: own };
  }
  if (requires.size) plan.metadata = { requires: [...requires].sort() };
  const validation = validateAutomationStudioFlowBootstrapPlan({ plan, registry: input.registry, resolution: input.resolution, ...(input.size ? { size: input.size } : {}) });
  if (!validation.ok || !validation.validated) return input.buildPlan;
  return { ...input.buildPlan, plan: validation.validated.plan, risk: validation.validated.risk, subflows: validation.validated.subflows };
}

/** The explored presses, one per control, that no step of `plan` already makes (header). */
function unanswered(plan: AutomationStudioFlowBootstrapPlan, explored: readonly AutomationStudioExploredInterruption[], handleViews: readonly { node: string; handle: string }[]): AutomationStudioExploredInterruption[] {
  const seen = new Set<string>();
  const kept: AutomationStudioExploredInterruption[] = [];
  for (const press of [...explored].reverse()) {
    const key = JSON.stringify([press.node, press.parameters]);
    if (seen.has(key)) continue;
    seen.add(key);
    const made = plan.subflows.some((subflow) => subflow.nodes.some((node) => node.definitionId === press.node && (
      handleViews.some((view) => view.node === `${subflow.key}.${node.key}` && press.handles.includes(view.handle))
      || (press.parameters.target !== undefined && JSON.stringify(node.parameters?.target) === JSON.stringify(press.parameters.target))
    )));
    if (!made) kept.unshift(press);
  }
  return kept;
}

/** Puts one handler for `press` into `subflow`: its registration, its press and its end, keyed apart from every node there. */
function lower(subflow: AutomationStudioFlowBootstrapSubflow, press: AutomationStudioExploredInterruption, definitions: { handler: AutomationStudioNodeDefinition; end: AutomationStudioNodeDefinition; press: AutomationStudioNodeDefinition }): void {
  const ids = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS;
  const patch = automationStudioLayerHandlerPatch({
    scope: { kind: "subflow", inherit: false },
    shown: { fact: "visible", op: "visible", target: press.parameters },
    gone: { fact: "visible", op: "equals", value: false, target: press.parameters },
    press: { definitionId: press.node, label: WORDS.press, parameters: press.parameters },
    reason: WORDS.reason,
    metadata: { learnedFrom: LEARNED_FROM, signature: press.signature }
  });
  const prefix = freePrefix(subflow);
  const [step] = patch.steps;
  const order = subflow.nodes.filter((node) => node.definitionId === ids.handler).length + 1;
  const outputActionId = derivedOutputActionId(definitions.press);
  const nodes: AutomationStudioFlowBootstrapNode[] = [
    {
      key: `${prefix}-s1`, definitionId: ids.handler, definitionVersion: definitions.handler.version, label: WORDS.registration,
      parameters: { event: patch.event, scope: patch.scope as JsonObject, when: patch.when as unknown as JsonObject[], order, completionCheck: (patch.completionCheck ?? []) as unknown as JsonObject[], maxRuns: 1 }
    },
    { key: `${prefix}-s2`, definitionId: press.node, definitionVersion: definitions.press.version, label: step?.label ?? WORDS.press, parameters: step?.parameters ?? {}, ...(outputActionId ? { outputActionId } : {}), consequences: [] },
    { key: `${prefix}-s3`, definitionId: ids.handlerEnd, definitionVersion: definitions.end.version, label: WORDS.end, parameters: { disposition: "resume", checkpointId: "", outputs: {} } }
  ];
  subflow.nodes.push(...nodes);
  subflow.edges.push(
    { key: `${prefix}-e1`, source: { nodeKey: `${prefix}-s1`, portId: "body" }, target: { nodeKey: `${prefix}-s2`, portId: entry(definitions.press) } },
    { key: `${prefix}-e2`, source: { nodeKey: `${prefix}-s2`, portId: success(definitions.press) }, target: { nodeKey: `${prefix}-s3`, portId: entry(definitions.end) } }
  );
}

/** A key prefix no node or edge of `subflow` starts with yet. */
function freePrefix(subflow: AutomationStudioFlowBootstrapSubflow): string {
  const keys = new Set([...subflow.nodes.map((node) => node.key), ...subflow.edges.map((edge) => edge.key)]);
  for (let index = 1; ; index += 1) {
    const prefix = `layer${index}`;
    if (![...keys].some((key) => key.startsWith(`${prefix}-`))) return prefix;
  }
}

/** The input a route enters a node by: its first that is not a data port. */
function entry(definition: AutomationStudioNodeDefinition): string {
  return definition.inputs.find((port) => port.role !== "data")?.id ?? "in";
}

/** The output a node leaves by when it worked. */
function success(definition: AutomationStudioNodeDefinition): string {
  return definition.outputs.find((port) => port.role === "success")?.id ?? "success";
}
