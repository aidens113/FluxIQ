// A layer the build closed while exploring becomes a handler of the submitted
// Flow (t787 fix 1 of `run-mvskptb1-c9cef4fe`). Mechanical: the model writes
// nothing.
//
// The build met a layer over the page, pressed its way out, and the site
// remembered: no trial met the layer again, so the model wrote no step for it,
// and playback on a fresh account met it and failed. The domain says which
// presses cleared such a layer (`../explored-interruptions.ts`), and each one
// the build recorded becomes the handler Core writes for a layer that got in
// the way (`./patch.ts`), lowered into
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
// A press the plan's own steps also make still gets the handler (P6, t796): the
// model's own press of the control is an ordinary step, which the plan may make
// optional, and a later pass finds the site remembering the layer closed, so
// that step is skipped when its control is absent; the layer, not the step, is
// what the Flow must answer wherever it shows again. The step stays harmless.
// Only a press recorded twice for the same control is made once. Nothing is
// added to a part that would then hold more nodes than the Flow allows. A
// handler the plan's check refuses is left out alone, the others stay, and it
// is named to the caller (`./dropped-handler.ts`); a plan valid without the
// handlers stays valid, never costing a submission.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioExploredInterruption, AutomationStudioExploredPress, AutomationStudioTrialInterruption } from "../explored-interruptions.ts";
import { derivedOutputActionId } from "../authoring/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapNode,
  type AutomationStudioFlowBootstrapSizeLimits,
  type AutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapSubflow,
  type AutomationStudioFlowBuildPlan
} from "../plan/index.ts";
import { automationStudioFlowBootstrapSubflowRequires } from "../script-statements/index.ts";
import type { AutomationStudioDroppedLayerHandler } from "./dropped-handler.ts";
import { automationStudioLayerHandlerPatch } from "./patch.ts";
import { automationStudioTrialLayerHandlerPatch } from "./trial.ts";
import { subflowWaitsForLayer } from "./waits-for-layer.ts";

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

/** The build plan with a handler for each explored cleared layer (header); the plan as given when there is none. */
export function automationStudioCandidateExploredLayerHandlers(input: {
  buildPlan: AutomationStudioFlowBuildPlan;
  /** Which handle each node was resolved from; no longer consulted, since a step pressing the same control no longer replaces the handler (header). */
  handleViews?: readonly { node: string; handle: string }[] | undefined;
  explored: readonly AutomationStudioExploredInterruption[];
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  size?: AutomationStudioFlowBootstrapSizeLimits | undefined;
  /** Receives each handler the plan's check refused and so left out, with the first issue's code (`./dropped-handler.ts`). */
  dropped?: AutomationStudioDroppedLayerHandler[] | undefined;
}): AutomationStudioFlowBuildPlan {
  const ids = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS;
  const handler = input.registry.get(ids.handler, input.resolution);
  const end = input.registry.get(ids.handlerEnd, input.resolution);
  const presses = distinctPresses(input.explored.filter((record): record is AutomationStudioExploredPress => record.kind !== "trial_close"));
  const trials = distinctTrials(input.explored.filter((record): record is AutomationStudioTrialInterruption => record.kind === "trial_close"));
  if (!handler || !end || !(presses.length || trials.length)) return input.buildPlan;
  const most = input.size?.maxNodesPerSubflow ?? Number.POSITIVE_INFINITY;
  const units: HandlerUnit[] = [];
  for (const press of presses) {
    const definition = input.registry.get(press.node, input.resolution);
    if (!definition) continue;
    units.push({
      layer: press.node,
      apply: (plan) => addToParts(plan, most, () => true, (subflow) => lower(subflow, explored(press), { handler, end, press: definition }))
    });
  }
  // A layer a trial closed: one handler per layer per part, none where the part already waits for it (P6, t799).
  for (const layer of trials) {
    const definition = input.registry.get(layer.wayOutDefinitionId, input.resolution);
    if (!definition) continue;
    units.push({
      layer: layer.name,
      apply: (plan) => addToParts(plan, most, (subflow) => !subflowWaitsForLayer(subflow, layer), (subflow) => lower(subflow, trialPatch(layer), { handler, end, press: definition }))
    });
  }
  const check = (plan: AutomationStudioFlowBootstrapPlan) => validate(plan, input);
  const all = structuredClone(input.buildPlan.plan);
  const total = units.reduce((sum, unit) => sum + unit.apply(all), 0);
  if (!total) return input.buildPlan;
  const whole = check(all);
  if (whole.built) return { ...input.buildPlan, ...whole.built };
  // One handler the check refuses must not take the others with it: each is added to what the others left, and the refused are named (header).
  let kept = structuredClone(input.buildPlan.plan);
  let accepted = 0;
  for (const unit of units) {
    const trial = structuredClone(kept);
    if (!unit.apply(trial)) continue;
    const verdict = check(trial);
    if (verdict.built) {
      kept = trial;
      accepted += 1;
    } else input.dropped?.push({ layer: unit.layer, code: verdict.code });
  }
  const final = accepted ? check(kept) : undefined;
  if (!final?.built) return input.buildPlan;
  return { ...input.buildPlan, ...final.built };
}

/** One handler to add to every part it fits. */
type HandlerUnit = {
  /** What a dropped handler is named by (`./dropped-handler.ts`). */
  layer: string;
  /** Adds the handler to each part of `plan` it fits and returns how many it was added to. */
  apply(plan: AutomationStudioFlowBootstrapPlan): number;
};

/** Runs `lower` on each part that is not a recovery part, still has room, and passes `fits`; how many it did it for. */
function addToParts(plan: AutomationStudioFlowBootstrapPlan, most: number, fits: (subflow: AutomationStudioFlowBootstrapSubflow) => boolean, lowerInto: (subflow: AutomationStudioFlowBootstrapSubflow) => void): number {
  let added = 0;
  for (const subflow of plan.subflows) {
    if (subflow.role === "recovery" || subflow.nodes.length + HANDLER_NODES > most || !fits(subflow)) continue;
    lowerInto(subflow);
    added += 1;
  }
  return added;
}

/** Records what each part requires, then checks the plan: the plan as built, or the first issue's code. */
function validate(plan: AutomationStudioFlowBootstrapPlan, input: { registry: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution; size?: AutomationStudioFlowBootstrapSizeLimits | undefined }):
  { built: Pick<AutomationStudioFlowBuildPlan, "plan" | "risk" | "subflows">; code?: undefined } | { built?: undefined; code: string } {
  const candidate = structuredClone(plan);
  const requires = new Set<string>();
  for (const subflow of candidate.subflows) {
    const own = automationStudioFlowBootstrapSubflowRequires(subflow);
    own.forEach((id) => requires.add(id));
    if (own.length) subflow.metadata = { ...subflow.metadata, requires: own };
  }
  if (requires.size) candidate.metadata = { requires: [...requires].sort() };
  const validation = validateAutomationStudioFlowBootstrapPlan({ plan: candidate, registry: input.registry, resolution: input.resolution, ...(input.size ? { size: input.size } : {}) });
  if (!validation.ok || !validation.validated) return { code: validation.issues.find((issue) => issue.severity === "error")?.code ?? validation.issues[0]?.code ?? "bootstrap.invalid" };
  return { built: { plan: validation.validated.plan, risk: validation.validated.risk, subflows: validation.validated.subflows } };
}

/** The explored presses, one per control (header). */
function distinctPresses(explored: readonly AutomationStudioExploredPress[]): AutomationStudioExploredPress[] {
  const seen = new Set<string>();
  const kept: AutomationStudioExploredPress[] = [];
  for (const press of [...explored].reverse()) {
    const key = JSON.stringify([press.node, press.parameters]);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.unshift(press);
  }
  return kept;
}

/** The trial's closes, one per layer by `id ?? name` (header). */
function distinctTrials(records: readonly AutomationStudioTrialInterruption[]): AutomationStudioTrialInterruption[] {
  const seen = new Set<string>();
  return records.filter((layer) => {
    const key = layer.id ?? layer.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The handler of one explored press: the control it used shown, and gone once it is not. */
function explored(press: AutomationStudioExploredPress): LoweredHandler {
  return {
    patch: automationStudioLayerHandlerPatch({
      scope: { kind: "subflow", inherit: false },
      shown: { fact: "visible", op: "visible", target: press.parameters },
      gone: { fact: "visible", op: "equals", value: false, target: press.parameters },
      press: { definitionId: press.node, label: WORDS.press, parameters: press.parameters },
      reason: WORDS.reason,
      metadata: { learnedFrom: LEARNED_FROM, signature: press.signature }
    })
  };
}

/** The handler of one layer a trial closed (`./trial.ts`). */
function trialPatch(layer: AutomationStudioTrialInterruption): LoweredHandler {
  return { patch: automationStudioTrialLayerHandlerPatch(layer) };
}

type LoweredHandler = { patch: ReturnType<typeof automationStudioLayerHandlerPatch> };

/** The node definitions a handler is written with. */
type LowerDefinitions = { handler: AutomationStudioNodeDefinition; end: AutomationStudioNodeDefinition; press: AutomationStudioNodeDefinition };

/** Puts one handler for `press` into `subflow`: its registration, its press and its end, keyed apart from every node there. */
function lower(subflow: AutomationStudioFlowBootstrapSubflow, lowered: LoweredHandler, definitions: LowerDefinitions): void {
  const ids = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS;
  const { patch } = lowered;
  const prefix = freePrefix(subflow);
  const [step] = patch.steps;
  const order = subflow.nodes.filter((node) => node.definitionId === ids.handler).length + 1;
  const outputActionId = derivedOutputActionId(definitions.press);
  const nodes: AutomationStudioFlowBootstrapNode[] = [
    {
      key: `${prefix}-s1`, definitionId: ids.handler, definitionVersion: definitions.handler.version, label: WORDS.registration,
      parameters: { event: patch.event, scope: patch.scope as JsonObject, when: patch.when as unknown as JsonObject[], order, completionCheck: (patch.completionCheck ?? []) as unknown as JsonObject[], maxRuns: 1 }
    },
    { key: `${prefix}-s2`, definitionId: definitions.press.id, definitionVersion: definitions.press.version, label: step?.label ?? WORDS.press, parameters: step?.parameters ?? {}, ...(outputActionId ? { outputActionId } : {}), consequences: [] },
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
