// Turning the draft a build accrued into a plan, beside the assembler that
// turns a model's written script into one.
//
// `assemble.ts` reads lines the model wrote. That is the whole of the old
// contract: the build explored, and then composed a result from memory, so the
// only thing there was to assemble was prose. A draft is not prose. It is the
// list of actions the loop actually took, each with the argument it was given
// and the state it produced, and a plan built from it cannot name a step that
// never happened.
//
// **This does not assemble the plan a second way.** It writes the draft out in
// the shape `assemble.ts` already reads and hands it over, so both paths derive
// keys, edges, ports, the router and every parameter through one piece of code.
// A second assembler is how the two would come to disagree about what a step
// means, and disagreeing about that is the defect this whole design exists to
// remove.
//
// **What only the domain knows is asked for, never guessed.** Core carries an
// action's name and argument opaquely and has no way to know which node runs
// it, so `write` is the caller's mapping from one to the other. A step the
// mapping declines is reported, not skipped quietly: a step that was performed
// and is missing from the result is precisely the failure this replaces, and it
// must never happen again without a line saying so.
//
// **A draft is not always a straight line.** A step may say when it runs --
// only if a check succeeded, optionally, recovering into another step, or
// repeating a span (`runtime/flow-draft/routing.ts`). What those statements
// mean as steps, ports and edges is `./draft-routing.ts`, which runs between
// the written steps and the assembler; a draft that says nothing comes through
// it unchanged.
//
// **A step may read an earlier step's output (P5, t270).** The draft keeps
// such a binding under the earlier step's own id, `$step.<id>.<output>`
// (`../../flow-draft/binding-forms.ts`). The plan names nodes by their key,
// `s1`, `s2`, ..., which is where a node sits in the assembled graph and not
// the draft's position -- a withdrawn step leaves no node, a join or loop the
// routing adds takes a key -- so each binding is rewritten to the key of the
// node its step became, `$node.<key>.<output>`, which the executor resolves
// to that node's id in the stored Flow (`../../executor/node-inputs.ts`).
// A binding the graph cannot honour refuses the plan, naming the reading
// step: its step is not in the Flow, does not run before the reader, declares
// no such output, is not always run, or repeats and is read from outside its
// repeat.

import type { JsonObject } from "../../../../../core/index.ts";
import {
  AUTOMATION_NODE_OUTPUT_REFERENCE_ROOT,
  automationNodeOutputReference,
  rewriteAutomationNodeStatePaths,
  type AutomationStudioNodeRegistry,
  type AutomationStudioNodeRegistryResolution
} from "../../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT,
  automationStudioFlowDraftConditionalStepReasons,
  automationStudioFlowDraftInputs,
  automationStudioFlowDraftRepeatIsWhile,
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStoredBindingKind,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import type { AutomationStudioRouteSignatures } from "../../route-state/index.ts";
import { automationStudioFlowBootstrapInstructionColumns } from "../answerability/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { assembleAutomationStudioFlowScriptPlan } from "./assemble.ts";
import type { AutomationStudioFlowScript, AutomationStudioFlowScriptStep } from "./contracts.ts";
import { authoringDraftBindingIssues, authoringPlanGraph } from "./draft-bindings.ts";
import { routeAutomationStudioFlowDraftSteps, type AutomationStudioFlowDraftRoutedStep } from "./draft-routing.ts";
import { authoringError } from "./issue.ts";

/** One draft step as a written step, in the caller's own vocabulary. */
export type AutomationStudioFlowDraftWrittenStep = {
  /** What the step does, in words. May name the node. */
  description: string;
  /** The node that runs it, by catalog id. */
  node?: string;
  /**
   * Each line of the step: the key as the script spells it, and its value.
   *
   * A node's parameters, and the one reserved word beside them -- what the step
   * would lastingly do (`./consequences.ts`), which is not a parameter of any
   * node and which the permission gate cannot work without.
   */
  entries?: readonly { key: string; value: string }[];
};

/**
 * The plan a draft makes, or the issues that refused it.
 *
 * `write` answers, for one step, what the script would have said about it, and
 * nothing for a step that belongs in no result -- an action the domain does not
 * express as a node. A step it declines becomes an issue rather than a silence.
 */
export function assembleAutomationStudioFlowDraftPlan(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  write(step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  summary: string;
  /**
   * The active instructions' own words, as the build read them. The columns
   * they name are declared as the schema of every extraction whose author
   * declared none (`./instruction-record-columns.ts`); absent, nothing is.
   */
  instructionText?: string | undefined;
  /**
   * The route signatures the build recorded for a step: the page it started
   * on and the page it left (`../../route-state/build-routing.ts`). Each plan
   * node a step becomes carries its step's, so the Flow node can, and a run
   * can continue at the node whose expected pre-state is the page it finds.
   * Absent, or answering nothing for a step, no node records any.
   */
  routeSignaturesOf?: ((step: AutomationStudioFlowDraftStep) => AutomationStudioRouteSignatures | undefined) | undefined;
}): {
  plan?: AutomationStudioFlowBootstrapPlan;
  refusedPlan?: AutomationStudioFlowBootstrapPlan;
  issues: AutomationStudioFlowBootstrapIssue[];
  /**
   * Which draft step each node of `plan` was written from, by node key and
   * step id. Only nodes a step became are here: a join or a loop this draft's
   * routing added was written from no step (`./draft-routing.ts`).
   */
  draftStepIdByNodeKey?: Record<string, string>;
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const routable: AutomationStudioFlowDraftRoutedStep[] = [];
  const perRow = stepsRunPerRow(input.steps);
  for (const step of input.steps) {
    const written = input.write(step);
    if (!written) {
      issues.push(authoringError("flow_draft.step_not_written", `Step ${step.position} did "${step.actionId}" and nothing said how to write it down, so the result would not contain it.`, `draft.steps.${step.position}`));
      continue;
    }
    const routeSignatures = input.routeSignaturesOf?.(step);
    const nodeLabel = perRow.has(automationStudioFlowDraftStepId(step)) ? undefined : describedName(step);
    routable.push({
      step,
      written: {
        description: written.description,
        ...(written.node ? { node: written.node } : {}),
        entries: (written.entries ?? []).map((entry) => ({ key: entry.key, lines: entry.value.split("\n"), line: 0 }))
      },
      ...(routeSignatures ? { routeSignatures } : {}),
      ...(nodeLabel ? { nodeLabel } : {})
    });
  }
  // What each step says about when it runs becomes the steps, ports and edges
  // that make it true (`./draft-routing.ts`). A draft that says nothing comes
  // back as the straight line it already was.
  const routed = routeAutomationStudioFlowDraftSteps({ steps: routable, registry: input.registry, resolution: input.resolution });
  issues.push(...routed.issues);
  // One line per step, counting from 1, so a refusal that names a line names
  // the step. There is no script to count lines in; this is what takes its
  // place, and a reader of an issue path still lands on the right step.
  const steps = routed.steps.map((step, index) => ({
    ...step,
    entries: step.entries.map((entry) => ({ ...entry, line: index + 1 })),
    branches: step.branches.map((branch) => ({ ...branch, line: index + 1 })),
    line: index + 1
  }));
  if (!steps.length) {
    issues.push(authoringError("flow_draft.no_steps", "The draft named no step the result could contain.", "draft"));
    return { issues };
  }
  const script: AutomationStudioFlowScript = { summary: input.summary, blocks: [{ name: input.summary, steps, line: 1 }] };
  const namedColumns = automationStudioFlowBootstrapInstructionColumns(input.instructionText ?? "");
  const assembled = assembleAutomationStudioFlowScriptPlan({ script, registry: input.registry, resolution: input.resolution, summary: input.summary, namedColumns });
  // What the steps' bindings say about the graph they became: a row read
  // outside a loop over a list, an input an output would overwrite
  // (`./draft-bindings.ts`). The plan's node `s<n>` is the n-th step it was
  // given (`./assemble.ts`), which is how each refusal names its draft step.
  const built = assembled.plan ?? assembled.refusedPlan;
  if (built) {
    const positionById = new Map(input.steps.map((step) => [automationStudioFlowDraftStepId(step), step.position] as const));
    issues.push(...authoringDraftBindingIssues({
      plan: built,
      stepPositionOf: (nodeKey) => {
        const draftStepId = /^s(\d+)$/u.test(nodeKey) ? steps[Number(nodeKey.slice(1)) - 1]?.draftStepId : undefined;
        return draftStepId === undefined ? undefined : positionById.get(draftStepId);
      },
      registry: input.registry,
      resolution: input.resolution
    }));
    issues.push(...earlierOutputIssues(input, built, draftStepIdByNodeKey(steps, built), positionById));
  }
  // One Flow input tested with two values: a run that supplies nothing would
  // use one value at one step and another at the next, and the build's test
  // would have run neither Flow (`../../flow-draft/flow-inputs.ts`, design t252 D3).
  for (const conflict of automationStudioFlowDraftInputs(input.steps).conflicts) {
    issues.push(authoringError(
      "flow_draft.input_conflict",
      `The Flow input "${conflict.name}" is given different test values by steps ${conflict.steps.join(", ")}: ${conflict.tests.map((test) => JSON.stringify(test)).join(" and ")}. A run that supplies no value would use one at one step and another at the next. Give every binding of "${conflict.name}" the same test value, or give the inputs different names.`,
      `draft.steps.${conflict.steps[0]}`
    ));
  }
  const all = [...issues, ...assembled.issues];
  // A step nothing could write down refuses the plan: it is a step that was
  // performed and would be absent from the result, which is the one outcome
  // the draft exists to make impossible. So does a binding the graph cannot
  // honour, since the Flow would run the step on nothing or on the wrong value,
  // and an input tested with two values.
  if (issues.length) return { issues: all, ...(built ? { refusedPlan: built } : {}) };
  const plan = assembled.plan ? withNodeOutputReferences(assembled.plan, draftStepIdByNodeKey(steps, assembled.plan)) : undefined;
  return {
    ...(plan ? { plan, draftStepIdByNodeKey: draftStepIdByNodeKey(steps, plan) } : {}),
    ...(assembled.refusedPlan ? { refusedPlan: assembled.refusedPlan } : {}),
    issues: all
  };
}

/**
 * The draft step each node was written from.
 *
 * The one Subflow names its nodes `s1`, `s2`, ... in the order of the steps it
 * was given (`./assemble.ts`), and a node is counted only when it is the node
 * its step named, so a key that ever landed on another step's node would be
 * left out rather than claimed.
 */
function draftStepIdByNodeKey(
  steps: readonly { node?: string; draftStepId?: string }[],
  plan: AutomationStudioFlowBootstrapPlan
): Record<string, string> {
  const nodes = new Map((plan.subflows[0]?.nodes ?? []).map((node) => [node.key, node] as const));
  const found: Record<string, string> = {};
  for (const [index, step] of steps.entries()) {
    const key = `s${index + 1}`;
    if (step.draftStepId !== undefined && step.node !== undefined && nodes.get(key)?.definitionId === step.node) found[key] = step.draftStepId;
  }
  return found;
}

/** Why the Flow would not always run a step, for the reasons that leave a reader of it with nothing (`../../flow-draft/routing.ts`). */
const UNRELIABLE_SOURCE = new Set(["interruption", "optional", "only_if", "fallback"]);

/**
 * The issues the plan's earlier-output bindings raise, each naming the step
 * that reads (see the header). `stepIdByKey` is which draft step each node of
 * the plan's one Subflow was written from.
 */
function earlierOutputIssues(
  input: { steps: readonly AutomationStudioFlowDraftStep[]; registry: AutomationStudioNodeRegistry; resolution: AutomationStudioNodeRegistryResolution },
  plan: AutomationStudioFlowBootstrapPlan,
  stepIdByKey: Readonly<Record<string, string>>,
  positionById: ReadonlyMap<string, number>
): AutomationStudioFlowBootstrapIssue[] {
  const nodes = plan.subflows[0]?.nodes ?? [];
  const indexById = new Map<string, number>();
  for (const [index, node] of nodes.entries()) {
    const id = stepIdByKey[node.key];
    if (id !== undefined) indexById.set(id, index);
  }
  const reasons = automationStudioFlowDraftConditionalStepReasons(input.steps);
  const spans = repeatSpans(input.steps);
  const idAt = (index: number): string | undefined => {
    const node = nodes[index];
    return node ? stepIdByKey[node.key] : undefined;
  };
  return earlierOutputBindingIssues({
    nodes,
    reader: (index) => {
      const readerId = idAt(index);
      const position = readerId === undefined ? undefined : positionById.get(readerId);
      return position === undefined
        ? { who: `The node "${nodes[index]!.key}"`, at: `plan.subflows.0.nodes.${index}` }
        : { who: `Step ${position}`, at: `draft.steps.${position}` };
    },
    source: (path) => {
      const binding = automationStudioFlowDraftStoredBindingKind({ $state: { path } });
      const index = binding?.kind === "step" ? indexById.get(binding.step) : undefined;
      if (binding?.kind !== "step" || index === undefined) return undefined;
      return { index, output: binding.output, name: `step ${positionById.get(binding.step) ?? "?"}` };
    },
    runsBefore: (source, reader) => source < reader,
    alwaysRuns: (source) => {
      const reason = reasons.get(idAt(source) ?? "");
      return reason === undefined || !UNRELIABLE_SOURCE.has(reason);
    },
    repeatsApart: (source, reader) => {
      const id = idAt(source);
      const span = id === undefined ? undefined : spans.find((members) => members.has(id));
      const readerId = idAt(reader);
      return span !== undefined && (readerId === undefined || !span.has(readerId));
    }
  }, input.registry, input.resolution);
}

/**
 * What the earlier-output checks ask of one Subflow, answered from a draft
 * (`earlierOutputIssues`) or from the graph of a plan written whole
 * (`automationStudioFlowBootstrapWrittenPlanBindingIssues`). The questions,
 * their order and their refusals are one; only where each answer comes from
 * differs, so a drafted Flow and a written one are held to the same rule.
 */
type EarlierOutputSubject = {
  nodes: readonly AutomationStudioFlowBootstrapNode[];
  /** Who reads, in a refusal's words, and the path the refusal names. */
  reader(index: number): { who: string; at: string };
  /** The node a binding's path reads, by index, its output, and its name in a refusal; nothing when it names no node of the plan. */
  source(path: string): { index: number; output: string; name: string } | undefined;
  /** Whether the source runs before the reader. */
  runsBefore(source: number, reader: number): boolean;
  /** Whether the Flow always runs the source on the way to the reader. */
  alwaysRuns(source: number, reader: number): boolean;
  /** Whether the source repeats in a loop the reader is outside. */
  repeatsApart(source: number, reader: number): boolean;
};

/** The one earlier-output checker (see the header and `EarlierOutputSubject`). */
function earlierOutputBindingIssues(
  subject: EarlierOutputSubject,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution
): AutomationStudioFlowBootstrapIssue[] {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  for (const [index, node] of subject.nodes.entries()) {
    const { who, at } = subject.reader(index);
    const refuse = (code: string, message: string): void => {
      if (!issues.some((issue) => issue.code === code && issue.path === at)) issues.push(authoringError(code, `${who} ${message}`, at));
    };
    for (const path of earlierOutputPaths(node.parameters)) {
      const found = subject.source(path);
      if (!found) {
        refuse("flow_draft.step_binding_source_missing", "reads an output of a step that is not in the Flow, so the Flow would have nothing to give it. Put that step back in the Flow, or give the value itself.");
        continue;
      }
      const source = found.name;
      if (!subject.runsBefore(found.index, index)) {
        refuse("flow_draft.step_binding_not_earlier", `reads an output of ${source}, which does not run before it, so the value does not exist yet when it runs. Move ${source} before it, or read a step that runs earlier.`);
        continue;
      }
      const sourceNode = subject.nodes[found.index]!;
      const outputs = registry.get(sourceNode.definitionId, resolution)?.outputs ?? [];
      if (!outputs.some((port) => port.id === found.output)) {
        refuse("flow_draft.step_binding_unknown_output", `reads the output "${found.output}" of ${source}, and its node "${sourceNode.definitionId}" declares no output by that name. Read an output that node declares.`);
        continue;
      }
      if (!subject.alwaysRuns(found.index, index)) {
        refuse("flow_draft.step_binding_conditional_source", `reads an output of ${source}, which the Flow does not always run, so a run that skips it would have nothing to read. Read a step that always runs, or give the value itself.`);
        continue;
      }
      if (subject.repeatsApart(found.index, index)) {
        refuse("flow_draft.step_binding_repeated_source", `reads an output of ${source}, which repeats, from outside that repeat, so it would read whichever pass ran last. Make it part of the same repeat, or read a step that does not repeat.`);
      }
    }
  }
  return issues;
}

/**
 * The issues the bindings of a plan written whole raise -- a candidate
 * submission's script or JSON plan, which no draft stands behind (t346).
 *
 * The same checks a drafted plan meets, asked of the graph instead of the
 * draft: a row read outside a loop over a list, or a field its listing does
 * not read; an input an output would overwrite; a cycle nothing bounds
 * (`./draft-bindings.ts`); and an earlier step's output, by `$node.<key>`, that
 * names no node, is read before it runs, names an output the node does not
 * declare, is not always run on the way, or repeats in a loop the reader is
 * outside (`earlierOutputBindingIssues`). Each issue names the node, and the
 * parameter where it can.
 */
export function automationStudioFlowBootstrapWrittenPlanBindingIssues(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapIssue[] {
  const issues = authoringDraftBindingIssues({ plan: input.plan, stepPositionOf: () => undefined, registry: input.registry, resolution: input.resolution, written: true });
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    const graph = authoringPlanGraph(subflow);
    const nodes = subflow.nodes;
    const keyAt = (index: number): string => nodes[index]?.key ?? "";
    const repeatsApart = (source: number, reader: number): boolean => {
      const loop = graph.loopOf(keyAt(source));
      return loop !== undefined && loop !== graph.loopOf(keyAt(reader));
    };
    issues.push(...earlierOutputBindingIssues({
      nodes,
      reader: (index) => ({ who: `The node "${keyAt(index)}"`, at: `plan.subflows.${subflowIndex}.nodes.${index}` }),
      source: (path) => {
        const reference = automationNodeOutputReference(path);
        const index = reference ? nodes.findIndex((node) => node.key === reference.key) : -1;
        if (!reference || index < 0) return undefined;
        return { index, output: reference.rest.split(".")[0] ?? "", name: `the node "${reference.key}"` };
      },
      runsBefore: (source, reader) => graph.precedes(keyAt(source), keyAt(reader)),
      // A step repeating in a loop the reader is outside is said as that, not
      // as merely not always run, which it also is.
      alwaysRuns: (source, reader) => graph.dominates(keyAt(source), keyAt(reader)) || repeatsApart(source, reader),
      repeatsApart
    }, input.registry, input.resolution));
  }
  return issues;
}

/**
 * Every earlier-output path in a node's parameters, at any depth a binding
 * resolves. A `$node` reference a step carries in from a saved Flow is one
 * too: its key named a node of that Flow, not of this plan, so it is refused
 * as naming no step rather than kept pointing at whatever now holds the key.
 */
function earlierOutputPaths(parameters: JsonObject | undefined): string[] {
  const paths: string[] = [];
  if (!parameters) return paths;
  const roots = [AUTOMATION_STUDIO_FLOW_DRAFT_STEP_OUTPUT_ROOT, AUTOMATION_NODE_OUTPUT_REFERENCE_ROOT];
  rewriteAutomationNodeStatePaths(parameters, (path) => {
    if (roots.some((root) => path === root || path.startsWith(`${root}.`))) paths.push(path);
    return undefined;
  });
  return paths;
}

/** The longest described name a node is labelled with: a name, never a passage of the page. */
const NODE_LABEL_MAX = 200;

/**
 * What a step's node is named: the domain's own words for what it acted on
 * (`does.target`, the step's `words`), which the build's cards already showed
 * (R3-U-12: playback's read card said only "Read list"). Nothing when the
 * domain gave none, or gave more than a name.
 */
function describedName(step: AutomationStudioFlowDraftStep): string | undefined {
  const name = step.words?.target?.replace(/\s+/gu, " ").trim();
  return name && name.length <= NODE_LABEL_MAX ? name : undefined;
}

/**
 * The steps a repeat over an earlier step runs once per row or pass: their
 * words name the one row the build explored ("Confirm · Jonas"), which every
 * other pass is not, so their nodes are not named after it. A span that runs
 * while its own last step succeeds walks no rows, and keeps its names.
 */
function stepsRunPerRow(steps: readonly AutomationStudioFlowDraftStep[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const [start, step] of steps.entries()) {
    const routing = step.routing;
    if (routing?.kind !== "repeat" || automationStudioFlowDraftRepeatIsWhile(routing)) continue;
    const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === routing.through);
    for (const member of steps.slice(start, end < start ? start + 1 : end + 1)) ids.add(automationStudioFlowDraftStepId(member));
  }
  return ids;
}

/** The ids of each span a step repeats: that step through the one it names as `through`, in draft order. */
function repeatSpans(steps: readonly AutomationStudioFlowDraftStep[]): ReadonlySet<string>[] {
  const spans: ReadonlySet<string>[] = [];
  for (const [start, step] of steps.entries()) {
    if (step.routing?.kind !== "repeat") continue;
    const through = step.routing.through;
    const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === through);
    spans.push(new Set(steps.slice(start, end < start ? start + 1 : end + 1).map(automationStudioFlowDraftStepId)));
  }
  return spans;
}

/**
 * The plan with every earlier-output binding naming the node its step became,
 * by that node's key (see the header). Called once every binding is known to
 * name a node of the plan's one Subflow.
 */
function withNodeOutputReferences(plan: AutomationStudioFlowBootstrapPlan, stepIdByKey: Readonly<Record<string, string>>): AutomationStudioFlowBootstrapPlan {
  const keyById = new Map(Object.entries(stepIdByKey).map(([key, id]) => [id, key] as const));
  const [first, ...rest] = plan.subflows;
  if (!first) return plan;
  let changed = false;
  const nodes = first.nodes.map((node) => {
    if (!node.parameters) return node;
    const parameters = rewriteAutomationNodeStatePaths(node.parameters, (path) => {
      const binding = automationStudioFlowDraftStoredBindingKind({ $state: { path } });
      const key = binding?.kind === "step" ? keyById.get(binding.step) : undefined;
      if (binding?.kind !== "step" || key === undefined) return undefined;
      return [AUTOMATION_NODE_OUTPUT_REFERENCE_ROOT, key, binding.output, ...(binding.path === undefined ? [] : [binding.path])].join(".");
    });
    if (parameters === node.parameters) return node;
    changed = true;
    return { ...node, parameters };
  });
  return changed ? { ...plan, subflows: [{ ...first, nodes }, ...rest] } : plan;
}
