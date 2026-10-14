import type { JsonObject } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS,
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS,
  type AutomationStudioFlowBootstrapEdge,
  type AutomationStudioFlowBootstrapNode,
  type AutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapSubflow
} from "../../flow-bootstrap/plan/index.ts";
import { automationStudioSubflowStepId, type AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectStructurePlan } from "../contracts/index.ts";

/** One reason a Flow could not be assembled, with the subflow it is about. */
export type AutomationStudioProjectAssemblyIssue = { code: string; subflowKey?: string; message: string };

/** What assembly made: the whole plan, the calls it wrote, and the inputs left to the Flow's own values. */
export type AutomationStudioProjectAssembled = {
  plan: AutomationStudioFlowBootstrapPlan;
  /** The router-run subflow assembly wrote, and the callable subflows it calls, in order; absent when every subflow had a proposal. */
  composed?: { subflowKey: string; calls: string[] };
  /** Each part input no earlier part hands back, taken from the Flow's own value of that name. */
  flowInputs: Array<{ subflowKey: string; input: string }>;
};

/**
 * Assembly (automation-project-agents-plan.md, `Assembly`, `How data crosses
 * subflows`): the structure plan with every subflow's latest done proposal
 * put in, as one `AutomationStudioFlowBootstrapPlan` for the whole
 * candidate's submission controller.
 *
 * - A subflow with a proposal is the proposal's: its target, keyed as the
 *   plan's subflow with the plan's interface and success check, and the helper
 *   parts it calls, already re-keyed under it (`<subflowKey>-<label>`).
 * - The one router-run subflow with no proposal is written here: a Call
 *   Subflow step for each callable subflow no proposal already calls, in the
 *   order their briefs' entries depend on each other (plan order between
 *   equals), each step's input bound to the latest earlier step's output of
 *   the same name, or, where no earlier part hands one back, to the Flow's own
 *   value of that name. Each call hands back every output the part declares.
 *   It keeps the plan's success check, and says it calls parts.
 * - The router is the plan's. The plan says what it requires as every subflow
 *   in it does.
 *
 * Refused, with every reason, when a subflow it needs has no proposal, a
 * proposal is for another plan or subflow, more than one router-run subflow
 * has none, the calls' order makes a circle, two subflows share a key, or two
 * briefs' subflows share a step id (`<subflowKey>-<nodeKey>`) or a record
 * output's dataset id, so one would save its rows over the other's (t555; the
 * re-keying already gives derived ones distinct ids, so what is left is a
 * name both builders wrote). Each such issue names both briefs.
 * Nothing here checks the Flow: the submission controller does, whole.
 */
export function automationStudioProjectAssembly(input: {
  structure: AutomationStudioProjectStructurePlan;
  /** The latest done proposal of each subflow, by subflow key. */
  proposals: ReadonlyMap<string, AutomationStudioSubflowProposal>;
  /** Each subflow's predecessors, as the brief of its proposal named them. */
  predecessors: ReadonlyMap<string, readonly string[]>;
}): { ok: true; assembled: AutomationStudioProjectAssembled } | { ok: false; issues: AutomationStudioProjectAssemblyIssue[] } {
  const { structure, proposals } = input;
  const plan = structure.plan;
  const issues: AutomationStudioProjectAssemblyIssue[] = [];
  const unproposed = plan.subflows.filter((subflow) => !subflow.interface && subflow.role !== "recovery" && !proposals.has(subflow.key));
  if (unproposed.length > 1) {
    for (const subflow of unproposed) issues.push({ code: "project.assemble_main_ambiguous", subflowKey: subflow.key, message: `More than one subflow the router runs has no proposal, so assembly cannot tell which one calls the parts. Brief a builder for "${subflow.key}", or change the plan.` });
  }
  const main = unproposed.length === 1 ? unproposed[0] : undefined;
  for (const subflow of plan.subflows) {
    const proposal = proposals.get(subflow.key);
    if (!proposal) {
      if (subflow !== main && !unproposed.includes(subflow)) issues.push({ code: "project.assemble_proposal_missing", subflowKey: subflow.key, message: `"${subflow.key}" has no done proposal under this plan. Send its brief and wait for it to come back done.` });
      continue;
    }
    if (proposal.scope.planDigest !== structure.digest || proposal.scope.subflowKey !== subflow.key || proposal.subflows[0]?.key !== subflow.key) {
      issues.push({ code: "project.assemble_proposal_stale", subflowKey: subflow.key, message: `The proposal for "${subflow.key}" was made for another plan or subflow. Send its brief again under this plan.` });
    }
  }
  if (issues.length) return { ok: false, issues };
  const proposed = (key: string): readonly AutomationStudioFlowBootstrapSubflow[] => proposals.get(key)?.subflows ?? [];
  const called = new Set(plan.subflows.flatMap((subflow) => proposed(subflow.key)).flatMap(callsOf));
  let composed: { subflow: AutomationStudioFlowBootstrapSubflow; calls: string[]; flowInputs: AutomationStudioProjectAssembled["flowInputs"] } | undefined;
  if (main) {
    const callees = plan.subflows.filter((subflow) => subflow.interface && subflow !== main && !called.has(subflow.key));
    if (!callees.length) return { ok: false, issues: [{ code: "project.assemble_nothing_to_call", subflowKey: main.key, message: `"${main.key}" has no proposal and there is no callable subflow for it to call. Brief a builder for it, or change the plan.` }] };
    const ordered = dependencyOrder(callees, input.predecessors);
    if (!ordered) return { ok: false, issues: [{ code: "project.assemble_cycle", subflowKey: main.key, message: "The callable subflows' predecessors make a circle, so they have no order to be called in. Change the briefs' predecessors or the plan." }] };
    composed = callsInOrder(main, ordered);
  }
  const sourced = plan.subflows.flatMap<Sourced>((subflow) => (composed && subflow === main ? [{ subflow: composed.subflow, brief: undefined }] : proposed(subflow.key).map((part) => ({ subflow: structuredClone(part), brief: proposals.get(subflow.key)!.scope.briefId }))));
  const subflows = sourced.map(({ subflow }) => subflow);
  const keys = new Set<string>();
  for (const subflow of subflows) {
    if (keys.has(subflow.key)) issues.push({ code: "project.assemble_key_collision", subflowKey: subflow.key, message: `Two subflows of the assembled Flow are keyed "${subflow.key}". Send a brief again for one of them, or change the plan.` });
    keys.add(subflow.key);
  }
  if (issues.length) return { ok: false, issues };
  issues.push(...sharedIds(sourced));
  if (issues.length) return { ok: false, issues };
  const requires = [...new Set([...(plan.metadata?.requires ?? []), ...subflows.flatMap((subflow) => subflow.metadata?.requires ?? [])])];
  const whole: AutomationStudioFlowBootstrapPlan = { schemaVersion: "0.1", router: structuredClone(plan.router), subflows };
  if (requires.length) whole.metadata = { requires };
  const assembled: AutomationStudioProjectAssembled = { plan: whole, flowInputs: composed?.flowInputs ?? [] };
  if (composed) assembled.composed = { subflowKey: composed.subflow.key, calls: composed.calls };
  return { ok: true, assembled };
}

/** Where an assembled subflow came from: the brief whose proposal holds it, or none for the one assembly wrote. */
type Sourced = { subflow: AutomationStudioFlowBootstrapSubflow; brief: string | undefined };

/** Each step id and dataset id two briefs' subflows both hold, naming both briefs (header); one subflow's own repeats are its brief's. */
function sharedIds(sourced: readonly Sourced[]): AutomationStudioProjectAssemblyIssue[] {
  const issues: AutomationStudioProjectAssemblyIssue[] = [];
  const steps = new Map<string, Sourced>();
  const datasets = new Map<string, Sourced>();
  const named = (source: Sourced) => (source.brief === undefined ? `the calls assembly wrote in "${source.subflow.key}"` : `brief "${source.brief}" ("${source.subflow.key}")`);
  for (const source of sourced) {
    for (const node of source.subflow.nodes) {
      const step = automationStudioSubflowStepId(source.subflow.key, node.key);
      const earlier = steps.get(step);
      if (earlier && earlier.brief !== source.brief) issues.push({ code: "project.assemble_step_id_collision", subflowKey: source.subflow.key, message: `The step id "${step}" is held by both ${named(earlier)} and ${named(source)}. Send one of those briefs again, or change the plan.` });
      else if (!earlier) steps.set(step, source);
      for (const dataset of datasetIds(node.parameters)) {
        const first = datasets.get(dataset);
        if (first && first.brief !== source.brief) issues.push({ code: "project.assemble_dataset_id_collision", subflowKey: source.subflow.key, message: `The dataset "${dataset}" is saved to by both ${named(first)} and ${named(source)}, so one would mix its rows into the other's. Send one of those briefs again with a dataset of its own, or change the plan.` });
        else if (!first) datasets.set(dataset, source);
      }
    }
  }
  return issues;
}

/** The dataset ids a step's record outputs name: any parameter that is an object naming a `datasetId`, Core's own contract. */
function datasetIds(parameters: JsonObject | undefined): string[] {
  return Object.values(parameters ?? {}).flatMap((value) => {
    const id = value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject).datasetId : undefined;
    return typeof id === "string" && id.trim() ? [id.trim()] : [];
  });
}

/** The subflows a subflow's Call Subflow steps name. */
function callsOf(subflow: AutomationStudioFlowBootstrapSubflow): string[] {
  return subflow.nodes.flatMap((node) => {
    const called = node.definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow ? (node.parameters as JsonObject | undefined)?.subflowId : undefined;
    return typeof called === "string" ? [called] : [];
  });
}

/** The callees with each after the callees its predecessors name, plan order between equals; undefined for a circle. */
function dependencyOrder(callees: readonly AutomationStudioFlowBootstrapSubflow[], predecessors: ReadonlyMap<string, readonly string[]>): AutomationStudioFlowBootstrapSubflow[] | undefined {
  const keys = new Set(callees.map((callee) => callee.key));
  const ordered: AutomationStudioFlowBootstrapSubflow[] = [];
  const placed = new Set<string>();
  while (ordered.length < callees.length) {
    const next = callees.find((callee) => !placed.has(callee.key) && (predecessors.get(callee.key) ?? []).every((key) => !keys.has(key) || placed.has(key)));
    if (!next) return undefined;
    placed.add(next.key);
    ordered.push(next);
  }
  return ordered;
}

/** The router-run subflow as one Call Subflow step per callee, in order, each input bound by name (header). */
function callsInOrder(main: AutomationStudioFlowBootstrapSubflow, callees: readonly AutomationStudioFlowBootstrapSubflow[]): { subflow: AutomationStudioFlowBootstrapSubflow; calls: string[]; flowInputs: AutomationStudioProjectAssembled["flowInputs"] } {
  const flowInputs: AutomationStudioProjectAssembled["flowInputs"] = [];
  const nodes: AutomationStudioFlowBootstrapNode[] = callees.map((callee, index) => {
    const inputs: JsonObject = {};
    for (const port of callee.interface?.inputs ?? []) {
      const from = callees.slice(0, index).map((earlier, at) => ({ earlier, at })).reverse().find(({ earlier }) => earlier.interface?.outputs.some((output) => output.id === port.id));
      if (from) inputs[port.id] = { $state: { path: `$node.${stepKey(from.at)}.${port.id}` } };
      else {
        inputs[port.id] = { $state: { path: port.id } };
        flowInputs.push({ subflowKey: callee.key, input: port.id });
      }
    }
    const outputs: JsonObject = Object.fromEntries((callee.interface?.outputs ?? []).map((output) => [output.id, output.id]));
    return {
      key: stepKey(index),
      definitionId: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow,
      definitionVersion: "1.0.0",
      parameters: { subflowId: callee.key, inputs, outputs, errors: {} },
      label: `run ${callee.name}`.slice(0, 200)
    };
  });
  const edges: AutomationStudioFlowBootstrapEdge[] = nodes.slice(1).map((node, index) => ({ key: `e${index + 1}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }));
  const requires = [...new Set([...(main.metadata?.requires ?? []), AUTOMATION_STUDIO_FLOW_BOOTSTRAP_REQUIREMENTS.subflowCalls])];
  const metadata = { ...structuredClone(main.metadata ?? {}), requires };
  const subflow: AutomationStudioFlowBootstrapSubflow = { key: main.key, name: main.name, role: main.role, nodes, edges, metadata };
  return { subflow, calls: callees.map((callee) => callee.key), flowInputs };
}

function stepKey(index: number): string {
  return `s${index + 1}`;
}
