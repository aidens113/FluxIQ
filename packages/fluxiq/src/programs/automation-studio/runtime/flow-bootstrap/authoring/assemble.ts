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
// never run and is refused. A `step: run subflow <label>` line names a route
// the block's `when:` already states -- the router, not a step, decides -- so
// it adds nothing, and one naming a block with no `when:` is refused rather
// than read as a rule that always holds.
//
// Order carries the meaning. Steps connect in the order they were written, on
// the node's first output port that no branch claimed, into the target's first
// free input port. An `on <port>: go to <label>` line claims a port and sends
// it to a named step instead. A label that names nothing, a label used twice,
// and a port a node does not declare are all refused with what was accepted
// named -- never guessed at, because a wrong edge is a Flow that does the
// wrong thing quietly.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationNodePort,
  AutomationStudioNodeDefinition,
  AutomationStudioNodeRegistry,
  AutomationStudioNodeRegistryResolution
} from "../../../nodes/index.ts";
import type {
  AutomationStudioFlowBootstrapEdge,
  AutomationStudioFlowBootstrapIssue,
  AutomationStudioFlowBootstrapNode,
  AutomationStudioFlowBootstrapPlan,
  AutomationStudioFlowBootstrapSubflow
} from "../plan/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS } from "../plan/index.ts";
import type { AutomationStudioFlowBootstrapRouteCondition } from "../plan/index.ts";
import { combineAutomationStudioRouteConditions, readAutomationStudioRouteCondition } from "./condition.ts";
import type { AutomationStudioFlowScript, AutomationStudioFlowScriptBlock, AutomationStudioFlowScriptStep } from "./contracts.ts";
import { isAuthoringConsequenceKey, readAuthoringConsequences } from "./consequences.ts";
import { authoringError, authoringWarning } from "./issue.ts";
import { authoringKey, authoringSymbol } from "./keys.ts";
import { matchAuthoringDefinition, matchAuthoringParameter, matchAuthoringParameterContaining, matchAuthoringPort } from "./matching.ts";
import { normaliseAuthoringNodeParameters } from "./normalise.ts";
import { authoringNestedValue, authoringParameterValue, authoringSetAtPath, isJsonObject } from "./values.ts";

const OUTPUT_ACTION_WORDS = new Set(["outputactionid", "outputaction", "outputid", "output", "runs"]);
const NAME_LIMIT = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxNameLength;

export function assembleAutomationStudioFlowScriptPlan(input: {
  script: AutomationStudioFlowScript;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  summary: string;
}): { plan?: AutomationStudioFlowBootstrapPlan; refusedPlan?: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const definitions = input.registry.list(input.resolution);
  const blocks = input.script.blocks;
  if (!blocks.length) {
    issues.push(authoringError("flow_script.no_steps", "The Flow script named no step.", "flow"));
    return { issues };
  }
  const subflowKeys = uniqueKeys(blocks.map((block, index) => index === 0 ? "main" : authoringSymbol(block.label ?? block.name) ?? `subflow${index}`));
  const stepLabels = new Map<string, number>();
  for (const [blockIndex, block] of blocks.entries()) {
    for (const step of block.steps) {
      if (!step.label) continue;
      if (stepLabels.has(step.label)) issues.push(authoringError("flow_script.duplicate_label", `The label "${step.label}" names more than one step; a label names one step.`, `flow.line.${step.line}`));
      else stepLabels.set(step.label, blockIndex);
    }
  }
  const blockLabels = new Map(blocks.flatMap((block, index) => block.label ? [[block.label, index] as const] : []));
  const routes = blockRoutes(blocks, issues);
  const subflows: AutomationStudioFlowBootstrapSubflow[] = [];
  const rules: AutomationStudioFlowBootstrapPlan["router"]["rules"] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    const built = buildSubflow({
      steps: block.steps,
      definitions,
      blockIndex,
      stepLabels,
      path: `plan.subflows.${subflows.length}`
    });
    issues.push(...built.issues);
    for (const step of block.steps) {
      if (!step.runsBlock) continue;
      const target = blockLabels.get(step.runsBlock);
      if (target === undefined) {
        issues.push(authoringError("flow_script.unknown_block", `The step at line ${step.line} runs "${step.runsBlock}", which no subflow block declares.`, `flow.line.${step.line}`));
        continue;
      }
      if (!blocks[target]!.when?.length) {
        issues.push(authoringError("flow_script.route_condition_missing", `The step at line ${step.line} runs "${step.runsBlock}", but that block has no \`when:\` line. The router picks a block before any step runs, so say in the block when it runs.`, `flow.line.${step.line}`));
        continue;
      }
      issues.push(authoringWarning("flow_script.run_subflow_ignored", `The step at line ${step.line} was left out: the router runs "${step.runsBlock}" by its \`when:\` line, not from a step.`, `flow.line.${step.line}`));
    }
    const condition = routes.conditions.get(blockIndex);
    if (condition) {
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
    const primary = blockIndex === routes.primary;
    subflows.push({
      key: subflowKeys[blockIndex]!,
      name: bounded(block.name, NAME_LIMIT),
      role: primary ? "primary" : block.role && block.role !== "primary" ? block.role : "utility",
      nodes: built.nodes,
      edges: built.edges
    });
  }
  if (!subflows.some((subflow) => subflow.role === "primary") && subflows[0]) subflows[0].role = "primary";
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1",
    router: {
      name: bounded(input.summary, NAME_LIMIT),
      rules,
      fallback: routes.fallback === undefined ? { kind: "fail" } : { kind: "subflow", targetSubflowKey: subflowKeys[routes.fallback]! }
    },
    subflows
  };
  // A refused script still yields the plan its steps got as far as, under a
  // name nothing builds from. It is what the refusal's feedback reads the node
  // definition out of, so `bootstrap.unknown_parameter` can answer with the
  // parameters the node does declare; without it a script refusal carried a
  // path into a plan the model never wrote and nothing else, and live builds
  // re-proposed the same key until the budget ended them.
  if (issues.some((issue) => issue.severity === "error")) return { refusedPlan: plan, issues };
  return { plan, issues };
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
 * none.
 */
function blockRoutes(blocks: readonly AutomationStudioFlowScriptBlock[], issues: AutomationStudioFlowBootstrapIssue[]): {
  conditions: Map<number, AutomationStudioFlowBootstrapRouteCondition>;
  fallback: number | undefined;
  primary: number;
} {
  const conditions = new Map<number, AutomationStudioFlowBootstrapRouteCondition>();
  const unconditioned: number[] = [];
  let main: number | undefined;
  for (const [index, block] of blocks.entries()) {
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
    issues.push(authoringError("flow_script.subflow_unreachable", `The block "${block.label}" at line ${block.line} has no \`when:\` line, so the router would never run it. Say when it runs, or put its steps outside every block.`, `flow.line.${block.line}`));
  }
  return { conditions, fallback, primary: fallback ?? 0 };
}

/** One block's nodes and the edges the order and the branches imply. */
function buildSubflow(input: {
  steps: readonly AutomationStudioFlowScriptStep[];
  definitions: readonly AutomationStudioNodeDefinition[];
  blockIndex: number;
  stepLabels: ReadonlyMap<string, number>;
  path: string;
}): { nodes: AutomationStudioFlowBootstrapNode[]; edges: AutomationStudioFlowBootstrapEdge[]; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const nodes: AutomationStudioFlowBootstrapNode[] = [];
  const definitionByKey = new Map<string, AutomationStudioNodeDefinition>();
  const keyByLabel = new Map<string, string>();
  const acting = input.steps.filter((step) => !step.runsBlock);
  for (const [index, step] of acting.entries()) {
    const nodePath = `${input.path}.nodes.${nodes.length}`;
    const found = matchAuthoringDefinition(step.node ?? step.description, input.definitions);
    if (!found.definition) {
      issues.push(authoringError("flow_script.unknown_node", found.candidates.length
        ? `The step at line ${step.line} could mean any of ${found.candidates.join(", ")}; name one nodeCatalog id on a "node:" line.`
        : `The step at line ${step.line} names no node in nodeCatalog; name one on a "node:" line.`, `${nodePath}.definitionId`));
      continue;
    }
    const key = `s${index + 1}`;
    const node = buildNode({ step, definition: found.definition, key, path: nodePath });
    issues.push(...node.issues);
    nodes.push(node.node);
    definitionByKey.set(key, found.definition);
    if (step.label) keyByLabel.set(step.label, key);
  }
  // A step whose node did not resolve has already refused the plan, and it
  // would put every later step's edges on the wrong node, so nothing is wired.
  if (nodes.length !== acting.length) return { nodes, edges: [], issues };
  const edges = wire({ steps: acting, nodes, definitionByKey, keyByLabel, stepLabels: input.stepLabels, blockIndex: input.blockIndex, issues });
  return { nodes, edges, issues };
}

function buildNode(input: {
  step: AutomationStudioFlowScriptStep;
  definition: AutomationStudioNodeDefinition;
  key: string;
  path: string;
}): { node: AutomationStudioFlowBootstrapNode; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const written: Record<string, JsonValue> = {};
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
    if (segments.length === 1) {
      const value = authoringParameterValue(text, parameter);
      if (value === undefined) {
        issues.push(authoringError("bootstrap.invalid_parameter_value", "Node parameter value does not satisfy its definition.", `${input.path}.parameters.${parameter.id}`));
        continue;
      }
      written[parameter.id] = value;
      continue;
    }
    const existing = written[parameter.id];
    const base: JsonObject = isJsonObject(existing) ? existing : {};
    authoringSetAtPath(base, segments.slice(1), authoringNestedValue(text));
    written[parameter.id] = base;
  }
  const normalised = normaliseAuthoringNodeParameters({
    definition: input.definition,
    written,
    path: input.path,
    fallbackName: input.step.description || input.definition.label
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
      ...(consequences ?? normalised.consequences ? { consequences: (consequences ?? normalised.consequences)! } : {})
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
}): AutomationStudioFlowBootstrapEdge[] {
  const edges: AutomationStudioFlowBootstrapEdge[] = [];
  const claimed = new Map<string, Set<string>>(input.nodes.map((node) => [node.key, new Set<string>()]));
  const used = new Map<string, Set<string>>(input.nodes.map((node) => [node.key, new Set<string>()]));
  const branches: Array<{ sourceKey: string; port: AutomationNodePort; targetKey: string }> = [];
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
      branches.push({ sourceKey, port, targetKey });
    }
  }
  // A branch to the step written next takes that step's one way in. When the
  // source still has a port no branch claimed, that is the port it falls
  // through on, and the fall-through would have nowhere to go: the run would
  // stop there -- which is what a live build's "close it if it is showing;
  // on failed: go to the next step" did on 2026-09-18. Branching every port
  // of a step is fine; leaving one to fall into a taken step is refused.
  for (const branch of branches) {
    const index = input.nodes.findIndex((node) => node.key === branch.sourceKey);
    if (branch.targetKey !== input.nodes[index + 1]?.key) continue;
    const outputs = input.definitionByKey.get(branch.sourceKey)?.outputs ?? [];
    if (!outputs.some((port) => !claimed.get(branch.sourceKey)!.has(port.id))) continue;
    const line = input.steps[index]?.branches.find((written) => input.keyByLabel.get(written.target) === branch.targetKey)?.line ?? input.steps[index]?.line ?? 0;
    input.issues.push(authoringError("flow_script.branch_to_next_step", `The branch at line ${line} goes to the step written next, which the step already falls into; a step takes one way in, so the run would stop after this step. To do different things in different situations the run can start in, give each situation a \`subflow <label>:\` block with a \`when:\` line.`, `flow.line.${line}`));
  }
  for (const branch of branches) {
    const target = targetPort(branch.targetKey, input.definitionByKey, used);
    if (!target) continue;
    edges.push(edge(edges.length, branch.sourceKey, branch.port.id, branch.targetKey, target));
  }
  for (const [index, node] of input.nodes.entries()) {
    const next = input.nodes[index + 1];
    if (!next) break;
    const definition = input.definitionByKey.get(node.key);
    const source = definition?.outputs.find((port) => !claimed.get(node.key)!.has(port.id));
    const target = targetPort(next.key, input.definitionByKey, used);
    if (!source || !target) continue;
    claimed.get(node.key)!.add(source.id);
    edges.push(edge(edges.length, node.key, source.id, next.key, target));
  }
  return edges;
}

function targetPort(key: string, definitions: ReadonlyMap<string, AutomationStudioNodeDefinition>, used: Map<string, Set<string>>): string | undefined {
  const inputs = definitions.get(key)?.inputs ?? [];
  const taken = used.get(key) ?? new Set<string>();
  const port = inputs.find((candidate) => candidate.multiple === true || !taken.has(candidate.id));
  if (!port) return undefined;
  taken.add(port.id);
  used.set(key, taken);
  return port.id;
}

function edge(index: number, sourceKey: string, sourcePort: string, targetKey: string, targetPortId: string): AutomationStudioFlowBootstrapEdge {
  return {
    key: `e${index + 1}`,
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
