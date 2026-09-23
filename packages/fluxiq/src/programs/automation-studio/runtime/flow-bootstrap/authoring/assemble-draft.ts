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
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { assembleAutomationStudioFlowScriptPlan } from "./assemble.ts";
import type { AutomationStudioFlowScript, AutomationStudioFlowScriptStep } from "./contracts.ts";
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
}): { plan?: AutomationStudioFlowBootstrapPlan; refusedPlan?: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const routable: AutomationStudioFlowDraftRoutedStep[] = [];
  for (const step of input.steps) {
    const written = input.write(step);
    if (!written) {
      issues.push(authoringError("flow_draft.step_not_written", `Step ${step.position} did "${step.actionId}" and nothing said how to write it down, so the result would not contain it.`, `draft.steps.${step.position}`));
      continue;
    }
    routable.push({
      step,
      written: {
        description: written.description,
        ...(written.node ? { node: written.node } : {}),
        entries: (written.entries ?? []).map((entry) => ({ key: entry.key, lines: entry.value.split("\n"), line: 0 }))
      }
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
  const assembled = assembleAutomationStudioFlowScriptPlan({ script, registry: input.registry, resolution: input.resolution, summary: input.summary });
  const all = [...issues, ...assembled.issues];
  // A step nothing could write down refuses the plan: it is a step that was
  // performed and would be absent from the result, which is the one outcome
  // the draft exists to make impossible.
  if (issues.length) return { issues: all, ...(assembled.plan ?? assembled.refusedPlan ? { refusedPlan: (assembled.plan ?? assembled.refusedPlan)! } : {}) };
  return { ...(assembled.plan ? { plan: assembled.plan } : {}), ...(assembled.refusedPlan ? { refusedPlan: assembled.refusedPlan } : {}), issues: all };
}
