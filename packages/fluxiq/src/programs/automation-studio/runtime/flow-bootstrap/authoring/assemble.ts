// Turning a Flow script into a plan.
//
// Everything the model did not write is derived here, and derived the same way
// every time: the schema version, each Subflow's key, each node's key and
// definition version, the output action a definition fixes, the edge between
// two consecutive steps, the Router that reaches a named block. What is left
// for the model is what only it knows -- which node, which values, and where a
// branch goes.
//
// A block's `when:` lines are its route. The router tests the blocks in the
// order written, runs the first whose condition holds, and runs the steps
// outside every block when none does; so the steps outside every block are
// the fallback, and a block with no `when:` that is not the fallback could
// never run and is refused -- unless a step calls it, which makes it a part
// (t388, `../script-statements/called-parts.ts`): its own Subflow, run by the
// call node that step becomes. A `step: run subflow <label>` naming a block
// with a `when:` names a route that line already states -- the router, not a
// step, decides -- so it adds nothing; one naming a part is a call.
//
// A handler (`on <event> ...:` to `end`) becomes a registration node and the
// body its `body` port leads through, in the graph of the block it is written
// in, or in the Flow's recovery Subflow for one written `everywhere`
// (`../script-statements/handler-blocks.ts`). A block's `start at:` and a
// step's `checkpoint:` become node metadata (`../script-statements/entry-points.ts`),
// a block's `done when:` its success check, and a Flow that uses any of them
// says so in `metadata.requires` (contract C10).
//
// Order carries the meaning. Steps connect in the order they were written, on
// the node's first output port that no branch claimed, into the target's first
// free input port. An `on <port>: go to <label>` line claims a port and sends
// it to a named step instead. A label that names nothing, a label used twice,
// and a port a node does not declare are all refused with what was accepted
// named -- never guessed at, because a wrong edge is a Flow that does the
// wrong thing quietly.
//
// Two things a model never writes are read here for the benefit of a script
// that was derived rather than written (`./assemble-draft.ts`, `./draft-routing.ts`).
// A branch may name the input port it arrives at, for a node whose ways in mean
// different things -- a list walker's rows and its path. And a step may be
// `routed`, meaning every edge out of it is written, so it does not also fall
// through to whatever stands next. Both exist because the code that derives a
// diamond or a loop knows exactly where each port goes, where a model writing
// prose relies on the order to say it.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  type AutomationNodePort,
  type AutomationStudioNodeDefinition,
  type AutomationStudioNodeRegistry,
  type AutomationStudioNodeRegistryResolution
} from "../../../nodes/index.ts";
import type {
  AutomationStudioFlowBootstrapEdge,
  AutomationStudioFlowBootstrapInterface,
  AutomationStudioFlowBootstrapIssue,
  AutomationStudioFlowBootstrapNode,
  AutomationStudioFlowBootstrapPlan,
  AutomationStudioFlowBootstrapSubflow
} from "../plan/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapRouteCondition } from "../plan/index.ts";
import { combineAutomationStudioRouteConditions, readAutomationStudioRouteCondition } from "./condition.ts";
import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowScript, AutomationStudioFlowScriptBlock, AutomationStudioFlowScriptStep } from "./contracts.ts";
import { isAuthoringConsequenceKey, readAuthoringConsequences } from "./consequences.ts";
import { authoringError, authoringWarning } from "./issue.ts";
import { authoringKey, authoringSymbol } from "./keys.ts";
import { automationStudioMatchWrittenParameterName } from "../plan/index.ts";
import { matchAuthoringDefinition, matchAuthoringParameter, matchAuthoringParameterContaining, matchAuthoringPort } from "./matching.ts";
import { normaliseAuthoringNodeParameters } from "./normalise.ts";
import { authoringNestedValue, authoringParameterValue, authoringSetAtPath, isJsonObject } from "./values.ts";
import { routeAutomationStudioFlowScriptRepeats } from "./draft-routing.ts";
import {
  automationStudioFlowBootstrapSubflowRequires,
  automationStudioFlowScriptCalledParts,
  automationStudioFlowScriptCallStep,
  automationStudioFlowScriptEntryPoints,
  automationStudioFlowScriptFacts,
  automationStudioFlowScriptGuardedSteps,
  automationStudioFlowScriptHandlerSteps,
  type AutomationStudioFlowScriptPart
} from "../script-statements/index.ts";
import { automationStudioFlowScriptLocator, type AutomationStudioFlowScriptLocatedSubflow } from "./script-locator.ts";
import { automationStudioScriptBinding, type AuthoringScriptBindingScope } from "./script-binding.ts";

const OUTPUT_ACTION_WORDS = new Set(["outputactionid", "outputaction", "outputid", "output", "runs"]);
const NAME_LIMIT = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxNameLength;

/**
 * The parameter ids this step already names outright, so a near match cannot
 * take a name the model wrote correctly on another line of the same step.
 */
function claimedParameterIds(
  entries: readonly { key: string }[],
  definition: AutomationStudioNodeDefinition
): ReadonlySet<string> {
  const declared = new Set(definition.parameters.map((parameter) => parameter.id));
  const claimed = new Set<string>();
  for (const entry of entries) {
    const head = entry.key.split(".").map((segment) => segment.trim()).filter(Boolean)[0] ?? "";
    if (declared.has(head)) claimed.add(head);
    else {
      const named = matchAuthoringParameter(head, definition);
      if (named) claimed.add(named.id);
    }
  }
  return claimed;
}

/** The nodes the grammar's own statements are lowered into, which a step never reaches by naming one (`../script-statements/`). */
const STATE_NODE_IDS: ReadonlySet<string> = new Set(Object.values(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS));

/** One Subflow as it is being built: the plan's, where its refusals point, and how its steps' labels became node keys. */
type GraphUnderConstruction = {
  subflow: AutomationStudioFlowBootstrapSubflow;
  index: number;
  located: { blockIndex: number; steps: AutomationStudioFlowScriptStep[]; nodeKeys: string[]; edges: AutomationStudioFlowBootstrapEdge[] };
  keyByLabel: ReadonlyMap<string, string>;
  partInputs: ReadonlySet<string> | undefined;
  handlers: number;
};

export function assembleAutomationStudioFlowScriptPlan(input: {
  script: AutomationStudioFlowScript;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  summary: string;
  /** The columns the instruction names, declared on an extraction whose author declared none (`./normalise.ts`). */
  namedColumns?: readonly string[] | undefined;
}): { plan?: AutomationStudioFlowBootstrapPlan; refusedPlan?: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[]; locator?: AutomationStudioFlowBootstrapIssueLocator } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const library = input.registry.list(input.resolution);
  // A written step is matched among the nodes a step may name; one Core
  // derived names its node exactly, the grammar's own among them.
  const definitions = library.filter((definition) => !STATE_NODE_IDS.has(definition.id));
  const match = (step: AutomationStudioFlowScriptStep): { definition?: AutomationStudioNodeDefinition | undefined; candidates: string[] } => step.derivedParameters !== undefined
    ? { definition: library.find((definition) => definition.id === step.node), candidates: [] }
    : matchAuthoringDefinition(step.node ?? step.description, definitions);
  const definitionOf = (step: AutomationStudioFlowScriptStep): AutomationStudioNodeDefinition | undefined => match(step).definition;
  // A step that runs a part becomes the call node that runs it
  // (`../script-statements/called-parts.ts`), and each block's `optional:`,
  // `only after:` and `repeat` statements become the steps that wire them
  // (`../script-statements/guarded-steps.ts`, `./draft-routing.ts`), before
  // anything else reads the block; a block with none comes through as it was.
  const called = automationStudioFlowScriptCalledParts(input.script.blocks);
  issues.push(...called.issues);
  const subflowKeys = blockSubflowKeys(called.blocks);
  const callable = input.registry.get(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow, input.resolution) !== undefined;
  const partByLabel = new Map([...called.parts.values()].map((part) => [part.label, part]));
  const writtenLabels = input.script.blocks.map((block) => new Set(block.steps.flatMap((step) => step.label === undefined ? [] : [step.label])));
  const elsewhereOf = (blockIndex: number) => (label: string) => writtenLabels.some((labels, other) => other !== blockIndex && labels.has(label));
  const blocks = called.blocks.map((block, blockIndex) => {
    const calling = block.steps.map((step) => {
      if (!step.calls) return step;
      if (!callable) issues.push(authoringError("flow_script.call_unavailable", `The step at line ${step.line} calls a part, which needs "${AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow}", and this library does not offer it.`, `flow.line.${step.calls.line}`));
      const part = partByLabel.get(step.calls.label);
      const lowered = automationStudioFlowScriptCallStep(step, part ?? { blockIndex: -1, label: step.calls.label, inputs: [], outputs: [] }, part ? subflowKeys[part.blockIndex]! : "missing");
      // A call to no part is already refused; its lines are not refused again.
      if (part) issues.push(...lowered.issues);
      return part ? lowered.step : { ...lowered.step, entries: [] };
    });
    const guarded = automationStudioFlowScriptGuardedSteps({
      steps: calling, blockIndex, registry: input.registry, resolution: input.resolution, definitionOf, elsewhere: elsewhereOf(blockIndex)
    });
    issues.push(...guarded.issues);
    const routed = routeAutomationStudioFlowScriptRepeats({ steps: guarded.steps, registry: input.registry, resolution: input.resolution });
    issues.push(...routed.issues);
    return routed.steps === block.steps ? block : { ...block, steps: [...routed.steps] };
  });
  if (!blocks.some((block) => !block.handler)) {
    issues.push(authoringError("flow_script.no_steps", "The Flow script named no step.", "flow"));
    return { issues };
  }
  // Each block's other entries and checkpoints, read off the steps as written (`../script-statements/entry-points.ts`).
  const entryPoints = called.blocks.map((block, blockIndex) => automationStudioFlowScriptEntryPoints({ block, elsewhere: elsewhereOf(blockIndex) }));
  const checkpoints = new Map(entryPoints.flatMap((found) => [...found.checkpoints]));
  for (const found of entryPoints) issues.push(...found.issues);
  const stepLabels = new Map<string, number>();
  for (const [blockIndex, block] of blocks.entries()) {
    for (const step of block.steps) {
      if (!step.label) continue;
      if (stepLabels.has(step.label)) issues.push(authoringError("flow_script.duplicate_label", `The label "${step.label}" names more than one step; a label names one step.`, `flow.line.${step.line}`));
      else stepLabels.set(step.label, blockIndex);
    }
  }
  const blockLabels = new Map(blocks.flatMap((block, index) => block.label && !block.handler ? [[block.label, index] as const] : []));
  // A handler's block and a part are not situations: the router never runs either.
  const routes = blockRoutes(blocks, issues, new Set([...called.parts.keys(), ...blocks.flatMap((block, index) => block.handler ? [index] : [])]));
  const subflows: AutomationStudioFlowBootstrapSubflow[] = [];
  const rules: AutomationStudioFlowBootstrapPlan["router"]["rules"] = [];
  // Where each node, edge and rule was written, for every refusal after this one (`./script-locator.ts`).
  const located: AutomationStudioFlowScriptLocatedSubflow[] = [];
  const unplaced: { path: string; step: AutomationStudioFlowScriptStep }[] = [];
  const ruleBlocks: number[] = [];
  const graphs = new Map<number, GraphUnderConstruction>();
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.handler) continue;
    const part = called.parts.get(blockIndex);
    const partInputs = part ? new Set(part.inputs) : undefined;
    const built = buildSubflow({
      steps: block.steps,
      match,
      blockIndex,
      subflowKey: subflowKeys[blockIndex]!,
      stepLabels,
      path: `plan.subflows.${subflows.length}`,
      namedColumns: input.namedColumns,
      partInputs
    });
    issues.push(...built.issues);
    unplaced.push(...built.unplaced);
    for (const step of block.steps) {
      if (!step.runsBlock) continue;
      const target = blockLabels.get(step.runsBlock);
      if (target === undefined) {
        issues.push(authoringError("flow_script.unknown_block", `The step at line ${step.line} runs "${step.runsBlock}", which no subflow block declares.`, `flow.line.${step.line}`));
        continue;
      }
      issues.push(authoringWarning("flow_script.run_subflow_ignored", `The step at line ${step.line} was left out: the router runs "${step.runsBlock}" by its \`when:\` line, not from a step.`, `flow.line.${step.line}`));
    }
    const condition = routes.conditions.get(blockIndex);
    if (condition) {
      ruleBlocks.push(blockIndex);
      rules.push({
        key: `r${rules.length + 1}`,
        name: bounded(block.name, NAME_LIMIT),
        targetSubflowKey: subflowKeys[blockIndex]!,
        routeTags: [(block.label ?? block.name).slice(0, 100)],
        condition
      });
    }
    if (!built.nodes.length) {
      // A fallback with no step of its own -- steps outside every block that
      // only named blocks -- is no fallback: a run no route matches fails.
      if (blockIndex === routes.fallback) routes.fallback = undefined;
      continue;
    }
    for (const [label, metadata] of entryPoints[blockIndex]!.metadata) {
      const node = built.nodes.find((candidate) => candidate.key === built.keyByLabel.get(label));
      if (node) node.metadata = metadata;
    }
    const success = automationStudioFlowScriptFacts(block.done ?? [], issues);
    const primary = blockIndex === routes.primary;
    const subflow: AutomationStudioFlowBootstrapSubflow = {
      key: subflowKeys[blockIndex]!,
      name: bounded(block.name, NAME_LIMIT),
      role: primary ? "primary" : block.role && block.role !== "primary" ? block.role : "utility",
      nodes: built.nodes,
      edges: built.edges,
      ...(part ? { interface: partInterface(part, built.labelKeys, stepLabels, blockIndex, issues) } : {}),
      ...(success?.length ? { metadata: { "fluxiq.successCheck": success } } : {})
    };
    const graph: GraphUnderConstruction = { subflow, index: subflows.length, located: { blockIndex, steps: [...built.placed], nodeKeys: built.nodes.map((node) => node.key), edges: built.edges }, keyByLabel: built.keyByLabel, partInputs, handlers: 0 };
    located.push(graph.located);
    subflows.push(subflow);
    graphs.set(blockIndex, graph);
  }
  attachHandlers({ blocks, graphs, subflows, located, unplaced, issues, stepLabels, checkpoints, match, namedColumns: input.namedColumns, subflowKeys, registry: input.registry, resolution: input.resolution });
  if (!subflows.some((subflow) => subflow.role === "primary")) {
    const first = subflows.find((subflow) => subflow.role !== "recovery" && !subflow.interface);
    if (first) first.role = "primary";
  }
  const requires = new Set<string>();
  for (const subflow of subflows) {
    const own = automationStudioFlowBootstrapSubflowRequires(subflow);
    own.forEach((id) => requires.add(id));
    if (own.length) subflow.metadata = { ...subflow.metadata, requires: own };
  }
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1",
    router: {
      name: bounded(input.summary, NAME_LIMIT),
      rules,
      fallback: routes.fallback === undefined ? { kind: "fail" } : { kind: "subflow", targetSubflowKey: subflowKeys[routes.fallback]! }
    },
    subflows,
    ...(requires.size ? { metadata: { requires: [...requires].sort() } } : {})
  };
  // A refused script still yields the plan its steps got as far as, under a
  // name nothing builds from. It is what the refusal's feedback reads the node
  // definition out of, so `bootstrap.unknown_parameter` can answer with the
  // parameters the node does declare; without it a script refusal carried a
  // path into a plan the model never wrote and nothing else, and live builds
  // re-proposed the same key until the budget ended them.
  const locator = automationStudioFlowScriptLocator({ script: input.script, subflows: located, unplaced, rules: ruleBlocks, fallback: routes.fallback });
  if (issues.some((issue) => issue.severity === "error")) return { refusedPlan: plan, issues, locator };
  return { plan, issues, locator };
}

/**
 * Each handler's registration, body and end, in the graph it registers in: the
 * block it is written in, or the Flow's recovery Subflow for one written
 * `everywhere` (`../script-statements/handler-blocks.ts`). A handler's nodes
 * are keyed apart from the block's own, `h<n>-s<m>`, so the two never collide.
 */
function attachHandlers(input: {
  blocks: readonly AutomationStudioFlowScriptBlock[];
  graphs: ReadonlyMap<number, GraphUnderConstruction>;
  subflows: AutomationStudioFlowBootstrapSubflow[];
  located: AutomationStudioFlowScriptLocatedSubflow[];
  unplaced: { path: string; step: AutomationStudioFlowScriptStep }[];
  issues: AutomationStudioFlowBootstrapIssue[];
  stepLabels: ReadonlyMap<string, number>;
  checkpoints: ReadonlyMap<string, string>;
  match(step: AutomationStudioFlowScriptStep): { definition?: AutomationStudioNodeDefinition | undefined; candidates: string[] };
  namedColumns: readonly string[] | undefined;
  subflowKeys: readonly string[];
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): void {
  const available = [AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handlerEnd]
    .every((id) => input.registry.get(id, input.resolution) !== undefined);
  let recovery: GraphUnderConstruction | undefined;
  let written = 0;
  for (const [blockIndex, block] of input.blocks.entries()) {
    const handler = block.handler;
    if (!handler) continue;
    const parent = handler.parent === undefined ? undefined : input.graphs.get(handler.parent);
    const lowered = automationStudioFlowScriptHandlerSteps({
      block,
      available,
      orderIn: (automation) => (automation ? (recovery?.handlers ?? 0) : (parent?.handlers ?? 0)) + 1,
      keyOf: (label) => parent?.keyByLabel.get(label),
      elsewhere: (label) => input.stepLabels.has(label) && input.stepLabels.get(label) !== handler.parent,
      checkpointOf: (label) => input.checkpoints.get(label)
    });
    input.issues.push(...lowered.issues);
    if (!lowered.steps.length) continue;
    if (lowered.automation && !recovery) {
      const key = uniqueKeys([...input.subflowKeys.filter(Boolean), "recovery"]).at(-1)!;
      const subflow: AutomationStudioFlowBootstrapSubflow = { key, name: "Recovery", role: "recovery", nodes: [], edges: [] };
      recovery = { subflow, index: input.subflows.length, located: { blockIndex, steps: [], nodeKeys: [], edges: subflow.edges }, keyByLabel: new Map(), partInputs: undefined, handlers: 0 };
      input.subflows.push(subflow);
      input.located.push(recovery.located);
    }
    const graph = lowered.automation ? recovery : parent;
    if (!graph) {
      input.issues.push(authoringError("flow_script.handler_invalid", `The handler at line ${handler.line} is written in a block with no step of its own to cover. Write it inside the block whose steps it covers, or say \`everywhere\`.`, `flow.line.${handler.line}`));
      continue;
    }
    graph.handlers += 1;
    written += 1;
    const built = buildSubflow({
      steps: lowered.steps,
      match: input.match,
      blockIndex,
      subflowKey: graph.subflow.key,
      stepLabels: input.stepLabels,
      path: `plan.subflows.${graph.index}`,
      nodeOffset: graph.subflow.nodes.length,
      keyPrefix: `h${written}-`,
      namedColumns: input.namedColumns,
      partInputs: lowered.automation ? undefined : graph.partInputs
    });
    input.issues.push(...built.issues);
    input.unplaced.push(...built.unplaced);
    graph.subflow.nodes.push(...built.nodes);
    graph.subflow.edges.push(...built.edges);
    graph.located.steps.push(...built.placed);
    graph.located.nodeKeys.push(...built.nodes.map((node) => node.key));
  }
}

/**
 * A part's interface (C2): each input as a port, and each output as a port
 * carrying the binding it is read from, which must be an output of one of the
 * part's own steps. Each other binding is refused at its line.
 */
function partInterface(
  part: AutomationStudioFlowScriptPart,
  labelKeys: ReadonlyMap<string, string>,
  stepLabels: ReadonlyMap<string, number>,
  blockIndex: number,
  issues: AutomationStudioFlowBootstrapIssue[]
): AutomationStudioFlowBootstrapInterface {
  const port = (name: string) => ({ id: name, name, valueType: { kind: "unknown" as const } });
  const outputs = part.outputs.flatMap((output) => {
    const bound = output.binding.startsWith("$step.")
      ? automationStudioScriptBinding(output.binding, undefined, { labelKeys, elsewhere: (label) => stepLabels.has(label) && stepLabels.get(label) !== blockIndex })
      : { refused: `"${output.binding.slice(0, 60)}" is not an output of one of this part's steps; write \`$step.<label>.<output>\`.` };
    if (!bound || "refused" in bound) {
      issues.push(authoringError("flow_script.part_interface_invalid", `The output "${output.name}" at line ${output.line} could not be read: ${bound ? bound.refused : "it names no binding."} A part hands back only what one of its own steps gave.`, `flow.line.${output.line}`));
      return [];
    }
    return [{ ...port(output.name), metadata: { binding: bound.value as JsonObject } }];
  });
  return { inputs: part.inputs.map((name) => ({ ...port(name), required: true as const })), outputs };
}

/** Each block's Subflow key: `main` for the first, the block's own label or name otherwise; none for a handler's block, which is no Subflow. */
function blockSubflowKeys(blocks: readonly AutomationStudioFlowScriptBlock[]): string[] {
  const own = blocks.flatMap((block, index) => block.handler ? [] : [index]);
  const keys = uniqueKeys(own.map((index) => index === 0 ? "main" : authoringSymbol(blocks[index]!.label ?? blocks[index]!.name) ?? `subflow${index}`));
  const byBlock = blocks.map(() => "");
  own.forEach((index, at) => { byBlock[index] = keys[at]!; });
  return byBlock;
}

/**
 * Which block each route runs, which block runs when no route holds, and
 * which block is the Flow's primary Subflow.
 *
 * The steps outside every block are the fallback. With none, a lone block
 * with no `when:` is; with no such block either, a run no route matches
 * fails, which is the honest answer when every situation the model named
 * has its own condition. The primary Subflow -- the one the Flow's inputs
 * and outputs map to -- is the fallback, or the first block when there is
 * none. A part and a handler's block (`apart`) are none of these: a step runs
 * the one and an event the other.
 */
function blockRoutes(blocks: readonly AutomationStudioFlowScriptBlock[], issues: AutomationStudioFlowBootstrapIssue[], apart: ReadonlySet<number>): {
  conditions: Map<number, AutomationStudioFlowBootstrapRouteCondition>;
  fallback: number | undefined;
  primary: number;
} {
  const conditions = new Map<number, AutomationStudioFlowBootstrapRouteCondition>();
  const unconditioned: number[] = [];
  let main: number | undefined;
  for (const [index, block] of blocks.entries()) {
    if (apart.has(index)) continue;
    const written = block.when ?? [];
    if (block.label === undefined) {
      main = index;
      for (const line of written) {
        issues.push(authoringError("flow_script.when_outside_block", `The \`when:\` at line ${line.line} is outside every block. The steps outside every block run when no block's condition holds, so they take no condition; put this situation's steps in a \`subflow <label>:\` block with the \`when:\` inside it.`, `flow.line.${line.line}`));
      }
      continue;
    }
    if (!written.length) {
      unconditioned.push(index);
      continue;
    }
    const read: AutomationStudioFlowBootstrapRouteCondition[] = [];
    for (const line of written) {
      const reading = readAutomationStudioRouteCondition(line.text);
      if (!reading.ok) {
        issues.push(authoringError("flow_script.invalid_condition", `The condition at line ${line.line} could not be read: ${reading.reason}`, `flow.line.${line.line}`));
        continue;
      }
      read.push(line.negate ? { type: "none", conditions: [reading.condition] } : reading.condition);
    }
    const combined = combineAutomationStudioRouteConditions(read);
    if (combined && read.length === written.length) conditions.set(index, combined);
  }
  const fallback = main ?? (unconditioned.length ? unconditioned[0] : undefined);
  for (const index of unconditioned) {
    if (index === fallback) continue;
    const block = blocks[index]!;
    issues.push(authoringError("flow_script.subflow_unreachable", `The block "${block.label}" at line ${block.line} has no \`when:\` line, so the router would never run it. Say when it runs, call it from a step with \`call: ${block.label}\`, or put its steps outside every block.`, `flow.line.${block.line}`));
  }
  const primary = fallback ?? blocks.findIndex((block, index) => !apart.has(index));
  return { conditions, fallback, primary: Math.max(0, primary) };
}

/** One block's nodes and the edges the order and the branches imply. */
function buildSubflow(input: {
  steps: readonly AutomationStudioFlowScriptStep[];
  /** The node a step names, as the assembler matches it, or the nodes it could mean. */
  match(step: AutomationStudioFlowScriptStep): { definition?: AutomationStudioNodeDefinition | undefined; candidates: string[] };
  blockIndex: number;
  /** The key this block's Subflow is given, which every step id in it is prefixed with. */
  subflowKey: string;
  stepLabels: ReadonlyMap<string, number>;
  /** `plan.subflows.<S>`: the Subflow these nodes go into. */
  path: string;
  /** How many nodes that Subflow already holds, for a handler's nodes added after the block's own. */
  nodeOffset?: number;
  /** Put before every node and edge key, so a handler's never meet the block's own (`h1-s1`). */
  keyPrefix?: string;
  namedColumns: readonly string[] | undefined;
  /** In a part, or a handler of one: the inputs it was given, the only `$input` its steps may read. */
  partInputs?: ReadonlySet<string> | undefined;
}): {
  nodes: AutomationStudioFlowBootstrapNode[];
  edges: AutomationStudioFlowBootstrapEdge[];
  issues: AutomationStudioFlowBootstrapIssue[];
  /** The step each node was built from, in node order, and each step that became no node with the path its refusal names. */
  placed: AutomationStudioFlowScriptStep[];
  unplaced: { path: string; step: AutomationStudioFlowScriptStep }[];
  /** The node key each labelled step got, for an entry, a checkpoint or a handler's scope. */
  keyByLabel: ReadonlyMap<string, string>;
  /** The node key each labelled step will have, for a binding that names it. */
  labelKeys: ReadonlyMap<string, string>;
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const nodes: AutomationStudioFlowBootstrapNode[] = [];
  const placed: AutomationStudioFlowScriptStep[] = [];
  const unplaced: { path: string; step: AutomationStudioFlowScriptStep }[] = [];
  const definitionByKey = new Map<string, AutomationStudioNodeDefinition>();
  const keyByLabel = new Map<string, string>();
  const acting = input.steps.filter((step) => !step.runsBlock);
  // The key each labelled step's node will have, for an earlier step's output
  // a value names by label (`scriptBinding`).
  const prefix = input.keyPrefix ?? "";
  const labelKeys = new Map<string, string>();
  for (const [index, step] of acting.entries()) if (step.label && !labelKeys.has(step.label)) labelKeys.set(step.label, `${prefix}s${index + 1}`);
  const bindings: AuthoringScriptBindingScope = { labelKeys, elsewhere: (label) => input.stepLabels.has(label) && input.stepLabels.get(label) !== input.blockIndex, partInputs: input.partInputs };
  for (const [index, step] of acting.entries()) {
    const nodePath = `${input.path}.nodes.${(input.nodeOffset ?? 0) + nodes.length}`;
    const { definition, candidates } = input.match(step);
    // A derived step's node is one of the grammar's own, which the statement
    // that made it already refused as unavailable; it is not refused twice.
    if (!definition && step.derivedParameters !== undefined) {
      unplaced.push({ path: `${nodePath}.definitionId`, step });
      continue;
    }
    if (!definition) {
      issues.push(authoringError("flow_script.unknown_node", candidates.length
        ? `The step at line ${step.line} could mean any of ${candidates.join(", ")}; name one nodeCatalog id on a "node:" line.`
        : `The step at line ${step.line} names no node in nodeCatalog; name one on a "node:" line.`, `${nodePath}.definitionId`));
      unplaced.push({ path: `${nodePath}.definitionId`, step });
      continue;
    }
    const key = `${prefix}s${index + 1}`;
    const node = buildNode({ step, definition, key, subflowKey: input.subflowKey, path: nodePath, namedColumns: input.namedColumns, bindings });
    issues.push(...node.issues);
    nodes.push(node.node);
    placed.push(step);
    definitionByKey.set(key, definition);
    if (step.label) keyByLabel.set(step.label, key);
  }
  // A step whose node did not resolve has already refused the plan, and it
  // would put every later step's edges on the wrong node, so nothing is wired.
  if (nodes.length !== acting.length) return { nodes, edges: [], issues, placed, unplaced, keyByLabel, labelKeys };
  const edges = wire({ steps: acting, nodes, definitionByKey, keyByLabel, stepLabels: input.stepLabels, blockIndex: input.blockIndex, issues, keyPrefix: prefix });
  return { nodes, edges, issues, placed, unplaced, keyByLabel, labelKeys };
}

function buildNode(input: {
  step: AutomationStudioFlowScriptStep;
  definition: AutomationStudioNodeDefinition;
  key: string;
  subflowKey: string;
  path: string;
  namedColumns: readonly string[] | undefined;
  bindings: AuthoringScriptBindingScope;
}): { node: AutomationStudioFlowBootstrapNode; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  // What Core set on a step it derived (`../script-statements/`), under the lines written beside it.
  const written: Record<string, JsonValue> = input.step.derivedParameters ? structuredClone(input.step.derivedParameters) : {};
  let outputActionId: string | undefined;
  // The step's own declaration of what it would lastingly do
  // (`./consequences.ts`). A reserved word, read exactly as the output action
  // is, because no node declares it as a parameter and the gate cannot work
  // without it.
  let consequences: string[] | undefined;
  for (const entry of input.step.entries) {
    let segments = entry.key.split(".").map((segment) => segment.trim()).filter(Boolean);
    let head = segments[0] ?? "";
    const text = entry.lines.join("\n").trim();
    let parameter = matchAuthoringParameter(head, input.definition);
    // A key that names no parameter but that exactly one structured parameter
    // declares as one of its own is read as having been written inside it.
    if (!parameter && !(segments.length === 1 && (OUTPUT_ACTION_WORDS.has(authoringKey(head)) || isAuthoringConsequenceKey(head)))) {
      const inside = matchAuthoringParameterContaining(head, input.definition);
      if (inside) {
        parameter = inside;
        segments = [inside.id, ...segments];
        head = inside.id;
      } else {
        // Nothing knows this key by name or by containment, so resolve it as
        // the nearest parameter this node declares before refusing it. A name
        // is a small slip, and a refusal is a paid provider call the evidence
        // says the model does not act on.
        //
        // **This is the second reader that had to learn it.** A Flow script
        // reaches this one and never `./normalise.ts`, so teaching only that
        // one left the live creation path refusing exactly as it had.
        const near = automationStudioMatchWrittenParameterName(head, text, input.definition, claimedParameterIds(input.step.entries, input.definition));
        const resolved = near && input.definition.parameters.find((candidate) => candidate.id === near.id);
        if (resolved) {
          parameter = resolved;
          segments = segments.length <= 1 ? [resolved.id] : [resolved.id, ...segments.slice(1)];
          head = resolved.id;
        }
      }
    }
    if (!parameter) {
      if (segments.length === 1 && OUTPUT_ACTION_WORDS.has(authoringKey(head))) outputActionId = text;
      else if (segments.length === 1 && isAuthoringConsequenceKey(head)) {
        const declared = readAuthoringConsequences(text);
        if (declared) consequences = declared;
        else issues.push(authoringError("bootstrap.invalid_consequences", "Step consequences must name the permission classes, or none.", `${input.path}.consequences`));
      } else issues.push(authoringError("bootstrap.unknown_parameter", "Node parameter is not declared by its definition.", `${input.path}.parameters.${head}`));
      continue;
    }
    // A value written as a binding -- `$row.<field>`, `$input.<name> = <test>`,
    // `$step.<label>.<output>` -- is the state binding it names, wherever it sits.
    const bound = automationStudioScriptBinding(text, segments.length === 1 ? parameter : undefined, input.bindings);
    if (bound && "refused" in bound) {
      issues.push(authoringError("flow_script.invalid_binding", bound.refused, `${input.path}.parameters.${[parameter.id, ...segments.slice(1)].join(".")}`));
      continue;
    }
    if (segments.length === 1) {
      const value = bound ? bound.value : authoringParameterValue(text, parameter);
      if (value === undefined) {
        issues.push(authoringError("bootstrap.invalid_parameter_value", "Node parameter value does not satisfy its definition.", `${input.path}.parameters.${parameter.id}`));
        continue;
      }
      written[parameter.id] = value;
      continue;
    }
    const existing = written[parameter.id];
    const base: JsonObject = isJsonObject(existing) ? existing : {};
    authoringSetAtPath(base, segments.slice(1), bound ? bound.value : authoringNestedValue(text));
    written[parameter.id] = base;
  }
  const normalised = normaliseAuthoringNodeParameters({
    definition: input.definition,
    written,
    path: input.path,
    fallbackName: input.step.description || input.definition.label,
    // The draft step's own id where it was written from one, which survives
    // routing adding joins around it; otherwise its Subflow and node key, which
    // the same script assembles to every time.
    stepId: input.step.draftStepId ?? `${input.subflowKey}-${input.key}`,
    namedColumns: input.namedColumns
  });
  issues.push(...normalised.issues);
  const derived = outputActionId ?? derivedOutputActionId(input.definition);
  if (input.definition.outputAction && !derived) {
    issues.push(authoringError("bootstrap.missing_output_action", "Node definition requires an explicit output action.", `${input.path}.outputActionId`));
  }
  return {
    node: {
      key: input.key,
      definitionId: input.definition.id,
      definitionVersion: input.definition.version,
      ...(Object.keys(normalised.parameters).length ? { parameters: normalised.parameters } : {}),
      ...(derived ? { outputActionId: derived } : {}),
      ...(consequences ?? normalised.consequences ? { consequences: (consequences ?? normalised.consequences)! } : {}),
      // The pages its draft step ran between; a step a model wrote has none (`./contracts.ts`).
      ...(input.step.routeSignatures ? { routeSignatures: structuredClone(input.step.routeSignatures) } : {}),
      // What its draft step did, in the domain's words; a step a model wrote has none (`./contracts.ts`).
      ...(input.step.nodeLabel ? { label: input.step.nodeLabel } : {}),
      // The span's `repeat pace:`, on its first step (`../script-statements/repeat-pace.ts`).
      ...(input.step.paceMs !== undefined ? { paceMs: input.step.paceMs } : {})
    },
    issues
  };
}

/** The output action a definition leaves no choice about. */
export function derivedOutputActionId(definition: AutomationStudioNodeDefinition): string | undefined {
  const contract = definition.outputAction;
  if (!contract) return undefined;
  if (contract.fixedOutputId) return contract.fixedOutputId;
  return contract.allowedOutputIds?.length === 1 ? contract.allowedOutputIds[0] : undefined;
}

/** The edges the written order implies, and the ones the branches name. */
function wire(input: {
  steps: readonly AutomationStudioFlowScriptStep[];
  nodes: readonly AutomationStudioFlowBootstrapNode[];
  definitionByKey: ReadonlyMap<string, AutomationStudioNodeDefinition>;
  keyByLabel: ReadonlyMap<string, string>;
  stepLabels: ReadonlyMap<string, number>;
  blockIndex: number;
  issues: AutomationStudioFlowBootstrapIssue[];
  keyPrefix: string;
}): AutomationStudioFlowBootstrapEdge[] {
  const edges: AutomationStudioFlowBootstrapEdge[] = [];
  const claimed = new Map<string, Set<string>>(input.nodes.map((node) => [node.key, new Set<string>()]));
  const used = new Map<string, Set<string>>(input.nodes.map((node) => [node.key, new Set<string>()]));
  const branches: Array<{ sourceKey: string; port: AutomationNodePort; targetKey: string; targetPortId?: string }> = [];
  for (const [index, step] of input.steps.entries()) {
    const sourceKey = input.nodes[index]?.key;
    const definition = sourceKey ? input.definitionByKey.get(sourceKey) : undefined;
    if (!sourceKey || !definition) continue;
    for (const branch of step.branches) {
      const port = matchAuthoringPort(branch.port, definition.outputs);
      if (!port) {
        input.issues.push(authoringError("flow_script.unknown_port", `The branch at line ${branch.line} names the port "${branch.port}"; this node declares ${definition.outputs.map((candidate) => candidate.id).join(", ") || "no output port"}.`, `flow.line.${branch.line}`));
        continue;
      }
      const targetKey = input.keyByLabel.get(branch.target);
      if (!targetKey) {
        const elsewhere = input.stepLabels.has(branch.target) && input.stepLabels.get(branch.target) !== input.blockIndex;
        input.issues.push(authoringError(elsewhere ? "flow_script.branch_across_blocks" : "flow_script.unknown_label", elsewhere
          ? `The branch at line ${branch.line} goes to "${branch.target}", which is in another block; a branch stays inside its own block.`
          : `The branch at line ${branch.line} goes to "${branch.target}", which labels no step.`, `flow.line.${branch.line}`));
        continue;
      }
      claimed.get(sourceKey)!.add(port.id);
      branches.push({ sourceKey, port, targetKey, ...(branch.targetPort ? { targetPortId: branch.targetPort } : {}) });
    }
  }
  // A branch to the step written next takes that step's one way in. When the
  // source still has a port no branch claimed, that is the port it falls
  // through on, and the fall-through would have nowhere to go: the run would
  // stop there -- which is what a live build's "close it if it is showing;
  // on failed: go to the next step" did on 2026-09-18. Branching every port
  // of a step is fine; leaving one to fall into a taken step is refused.
  //
  // Two steps are not that mistake and are skipped. A `routed` step has no
  // fall-through to strand, because the code that wrote it wrote every edge
  // out of it. And a target that joins paths -- an input port declaring
  // `multiple` -- has more than one way in by construction, which is how a
  // branch and the path it left rejoin (`./assemble-draft.ts`).
  for (const branch of branches) {
    const index = input.nodes.findIndex((node) => node.key === branch.sourceKey);
    if (branch.targetKey !== input.nodes[index + 1]?.key) continue;
    if (input.steps[index]?.routed || joins(branch.targetKey, input.definitionByKey)) continue;
    const outputs = input.definitionByKey.get(branch.sourceKey)?.outputs ?? [];
    if (!outputs.some((port) => !claimed.get(branch.sourceKey)!.has(port.id))) continue;
    const line = input.steps[index]?.branches.find((written) => input.keyByLabel.get(written.target) === branch.targetKey)?.line ?? input.steps[index]?.line ?? 0;
    input.issues.push(authoringError("flow_script.branch_to_next_step", `The branch at line ${line} goes to the step written next, which the step already falls into; a step takes one way in, so the run would stop after this step. To do different things in different situations the run can start in, give each situation a \`subflow <label>:\` block with a \`when:\` line.`, `flow.line.${line}`));
  }
  for (const branch of branches) {
    const target = targetPort(branch.targetKey, input.definitionByKey, used, branch.targetPortId);
    if (!target) continue;
    edges.push(edge(`${input.keyPrefix}e${edges.length + 1}`, branch.sourceKey, branch.port.id, branch.targetKey, target));
  }
  for (const [index, node] of input.nodes.entries()) {
    const next = input.nodes[index + 1];
    if (!next) break;
    // A step that wrote all its own edges does not also fall into the next one.
    if (input.steps[index]?.routed) continue;
    const definition = input.definitionByKey.get(node.key);
    const source = definition?.outputs.find((port) => !claimed.get(node.key)!.has(port.id));
    const target = targetPort(next.key, input.definitionByKey, used);
    if (!source || !target) continue;
    claimed.get(node.key)!.add(source.id);
    edges.push(edge(`${input.keyPrefix}e${edges.length + 1}`, node.key, source.id, next.key, target));
  }
  return edges;
}

/** Whether a node declares a way in that several paths may arrive at. */
function joins(key: string, definitions: ReadonlyMap<string, AutomationStudioNodeDefinition>): boolean {
  return (definitions.get(key)?.inputs ?? []).some((port) => port.multiple === true);
}

/**
 * Which of a target's input ports an edge arrives at: the one asked for, or
 * the first still free.
 *
 * A named port is taken as written and still marked used, so two edges naming
 * the same single-connection port are caught by validation rather than
 * silently redirected to another port that happened to be free.
 *
 * A port that declares `role: "data"` is reached only by name. It carries a
 * value, not the path -- a loop's current row, say -- and an edge that fell
 * into it because the control input was already taken would hand the node
 * a success signal where it expects a row, and leave the node with no way in.
 */
function targetPort(key: string, definitions: ReadonlyMap<string, AutomationStudioNodeDefinition>, used: Map<string, Set<string>>, asked?: string): string | undefined {
  const inputs = definitions.get(key)?.inputs ?? [];
  const taken = used.get(key) ?? new Set<string>();
  const port = asked
    ? inputs.find((candidate) => candidate.id === asked)
    : inputs.find((candidate) => candidate.role !== "data" && (candidate.multiple === true || !taken.has(candidate.id)));
  if (!port) return undefined;
  taken.add(port.id);
  used.set(key, taken);
  return port.id;
}

function edge(key: string, sourceKey: string, sourcePort: string, targetKey: string, targetPortId: string): AutomationStudioFlowBootstrapEdge {
  return {
    key,
    source: { nodeKey: sourceKey, portId: sourcePort },
    target: { nodeKey: targetKey, portId: targetPortId }
  };
}

function uniqueKeys(candidates: string[]): string[] {
  const seen = new Set<string>();
  return candidates.map((candidate, index) => {
    let key = candidate;
    while (seen.has(key)) key = `${candidate}-${index}`.slice(0, 64);
    seen.add(key);
    return key;
  });
}

function bounded(text: string, limit: number): string {
  const trimmed = text.replace(/\s+/gu, " ").trim();
  return (trimmed || "Flow").slice(0, limit);
}
