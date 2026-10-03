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

import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { automationStudioFlowDraftInputs, automationStudioFlowDraftStepId, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioRouteSignatures } from "../../route-state/index.ts";
import { automationStudioFlowBootstrapInstructionColumns } from "../answerability/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { assembleAutomationStudioFlowScriptPlan } from "./assemble.ts";
import type { AutomationStudioFlowScript, AutomationStudioFlowScriptStep } from "./contracts.ts";
import { authoringDraftBindingIssues } from "./draft-bindings.ts";
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
  for (const step of input.steps) {
    const written = input.write(step);
    if (!written) {
      issues.push(authoringError("flow_draft.step_not_written", `Step ${step.position} did "${step.actionId}" and nothing said how to write it down, so the result would not contain it.`, `draft.steps.${step.position}`));
      continue;
    }
    const routeSignatures = input.routeSignaturesOf?.(step);
    routable.push({
      step,
      written: {
        description: written.description,
        ...(written.node ? { node: written.node } : {}),
        entries: (written.entries ?? []).map((entry) => ({ key: entry.key, lines: entry.value.split("\n"), line: 0 }))
      },
      ...(routeSignatures ? { routeSignatures } : {})
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
  return {
    ...(assembled.plan ? { plan: assembled.plan, draftStepIdByNodeKey: draftStepIdByNodeKey(steps, assembled.plan) } : {}),
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
