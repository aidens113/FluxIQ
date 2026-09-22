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

import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { assembleAutomationStudioFlowScriptPlan } from "./assemble.ts";
import type { AutomationStudioFlowScript, AutomationStudioFlowScriptStep } from "./contracts.ts";
import { authoringError } from "./issue.ts";

/** One draft step as a written step, in the caller's own vocabulary. */
export type AutomationStudioFlowDraftWrittenStep = {
  /** What the step does, in words. May name the node. */
  description: string;
  /** The node that runs it, by catalog id. */
  node?: string;
  /** Each parameter line: the key as the script spells it, and its value. */
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
  const steps: AutomationStudioFlowScriptStep[] = [];
  for (const step of input.steps) {
    const written = input.write(step);
    if (!written) {
      issues.push(authoringError("flow_draft.step_not_written", `Step ${step.position} did "${step.actionId}" and nothing said how to write it down, so the result would not contain it.`, `draft.steps.${step.position}`));
      continue;
    }
    // One line per step, counting from 1, so a refusal that names a line names
    // the step. There is no script to count lines in; this is what takes its
    // place, and a reader of an issue path still lands on the right step.
    const line = steps.length + 1;
    steps.push({
      description: written.description,
      ...(written.node ? { node: written.node } : {}),
      entries: (written.entries ?? []).map((entry) => ({ key: entry.key, lines: entry.value.split("\n"), line })),
      branches: [],
      line
    });
  }
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
