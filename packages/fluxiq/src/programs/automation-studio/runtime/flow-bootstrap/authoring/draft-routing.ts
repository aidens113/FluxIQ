// Turning what a draft step says about when it runs into the steps, ports and
// edges that make it true.
//
// The model states a relation between steps -- this one is optional, that one
// guards it, this span repeats over those rows -- and never a graph
// (`runtime/flow-draft/routing.ts`). Everything the graph needs is here, and it
// is derived from the node definitions rather than asked for: which port
// carries the rows, where the paths join again, what closes the loop and what
// bounds it.
//
// **Three shapes, and every one of them is a diamond.** A path leaves the line,
// does or skips something, and comes back. What it comes back *to* is always a
// Merge, because a Flow node takes one way in and a join needs a node that
// takes several -- `builtin.control.merge` declares `branches` as a port
// several edges may arrive at, and it is the only thing in the library that
// does. So the derivation is: put a Merge where the paths meet, and wire each
// port of the step that parts them.
//
//   optional    step.failed -> join          step.success -> join
//   only_if     check.failed -> join         check.success falls into the step
//   on_failed   step.failed -> the other     step.success -> join
//   repeat      a Merge at the head of the loop, a Merge at its exit, and the
//               last step of the span wired back to the head
//
// **A loop is a cycle and Core's plan validation refuses cycles**, which is
// right for everything except this. So the back edge arrives at the head
// Merge's `branches`, and `plan/validation.ts` reads an edge into a port that
// declares `multiple` as a join rather than as a cycle. Nothing else changes:
// a cycle that does not pass through a join is still refused.
//
// **What this refuses rather than guesses.** A guard that is not the step
// before the one it guards, a recovery into a step already behind us, a span
// that is not contiguous, a loop inside a loop. Each is a shape whose meaning
// is not obvious from the statement, and a wrong edge is a Flow that does the
// wrong thing quietly. Each refusal names the amendment that fixes it.

import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepId } from "../../flow-draft/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioFlowScriptBranch, AutomationStudioFlowScriptStep } from "./contracts.ts";
import { authoringError } from "./issue.ts";
import { matchAuthoringDefinition } from "./matching.ts";

/**
 * The join, and the node a list is walked with.
 *
 * Written as the ids they are, the way `executor/graph-run.ts` writes For
 * Each's, and checked against the registry before either is used: a host whose
 * library does not hold them cannot have a Flow that branches, and saying so is
 * better than assembling a plan whose nodes do not resolve.
 */
const MERGE_NODE_ID = "builtin.control.merge";
const FOR_EACH_NODE_ID = "builtin.control.for-each";

/** One step of the draft, already written down in the caller's vocabulary. */
export type AutomationStudioFlowDraftRoutedStep = {
  step: AutomationStudioFlowDraftStep;
  written: Pick<AutomationStudioFlowScriptStep, "description" | "node" | "entries">;
};

/**
 * The script steps a routed draft makes, in order, or the issues that refused
 * it.
 *
 * A draft whose steps say nothing about when they run comes back as the same
 * straight line it always was, with no labels and no derived nodes: the whole
 * of this module is inert until the model uses it.
 */
export function routeAutomationStudioFlowDraftSteps(input: {
  steps: readonly AutomationStudioFlowDraftRoutedStep[];
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): { steps: AutomationStudioFlowScriptStep[]; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const emitted: AutomationStudioFlowScriptStep[] = [];
  const byId = new Map(input.steps.map((entry) => [automationStudioFlowDraftStepId(entry.step), entry] as const));
  const consumed = new Set<string>();
  const positionOf = new Map([...byId.keys()].map((id, index) => [id, index] as const));
  let derived = 0;
  const label = (id: string): string => id.toLowerCase();
  const nextDerived = (kind: string): string => `${kind}${(derived += 1)}`;
  const refuse = (step: AutomationStudioFlowDraftStep, code: string, message: string): void => {
    issues.push(authoringError(code, message, `draft.steps.${step.position}`));
  };
  const needsLibrary = input.steps.some((entry) => entry.step.routing !== undefined);
  if (needsLibrary) {
    for (const id of [MERGE_NODE_ID, FOR_EACH_NODE_ID]) {
      if (input.registry.get(id, input.resolution)) continue;
      issues.push(authoringError("flow_draft.routing_unavailable", `A Flow that branches or repeats needs "${id}", which this library does not offer.`, "draft"));
      return { steps: [], issues };
    }
  }

  for (const [index, entry] of input.steps.entries()) {
    const id = automationStudioFlowDraftStepId(entry.step);
    if (consumed.has(id)) continue;
    const routing = entry.step.routing;
    if (!routing) {
      emitted.push(scriptStep(entry, needsLibrary ? label(id) : undefined));
      continue;
    }
    if (routing.kind === "optional") {
      const join = nextDerived("join");
      emitted.push({ ...scriptStep(entry, label(id)), branches: [branch("failed", join)] });
      emitted.push(mergeStep(join, "the paths after an optional step meet here"));
      continue;
    }
    if (routing.kind === "only_if") {
      const guard = emitted[emitted.length - 1];
      if (!guard || guard.label !== label(routing.check)) {
        refuse(entry.step, "flow_draft.check_not_before_step", `Step ${entry.step.position} runs only if another step succeeded, but that step is not the one before it. Move it there with an amend_draft reorder, or say only_if with no check to mean the step before this one.`);
        continue;
      }
      const join = nextDerived("join");
      // The guard keeps its fall-through into the step it guards; what changes
      // is where its failure goes, which is past the step rather than nowhere.
      guard.branches = [...guard.branches, branch("failed", join)];
      emitted.push(scriptStep(entry, label(id)));
      emitted.push(mergeStep(join, "the paths after a conditional step meet here"));
      continue;
    }
    if (routing.kind === "on_failed") {
      const recovery = byId.get(routing.to);
      if (!recovery || consumed.has(routing.to) || (positionOf.get(routing.to) ?? -1) < index) {
        refuse(entry.step, "flow_draft.recovery_behind_step", `Step ${entry.step.position} recovers into a step the Flow has already run, which it cannot go back to. Name a step written after it, or run the recovery you want and then say on_failed.`);
        continue;
      }
      if (recovery.step.routing) {
        refuse(entry.step, "flow_draft.recovery_is_routed", `Step ${entry.step.position} recovers into step ${recovery.step.position}, which itself says when it runs. A recovery step runs when the step it recovers fails and at no other time.`);
        continue;
      }
      const join = nextDerived("join");
      consumed.add(routing.to);
      emitted.push({ ...scriptStep(entry, label(id)), branches: [branch("failed", label(routing.to)), branch("success", join)], routed: true });
      emitted.push(scriptStep(recovery, label(routing.to)));
      emitted.push(mergeStep(join, "the paths after a recovered step meet here"));
      continue;
    }
    const repeated = repeat({ entry, routing, index, byId, positionOf, emitted, consumed, label, nextDerived, registry: input.registry, resolution: input.resolution });
    if (repeated) refuse(entry.step, repeated.code, repeated.message);
  }
  return { steps: emitted, issues };
}

/**
 * A span that repeats, wired around the step it repeats on, or the reason it
 * could not be.
 *
 * Which of the two loops it is comes from the node, not from the model: a step
 * whose definition declares a list output produced rows, so the span runs once
 * for each of them; a step that declares none is a check, so the span runs for
 * as long as it keeps succeeding. Asking the model which it meant would be
 * asking it a question its own draft already answers.
 */
function repeat(input: {
  entry: AutomationStudioFlowDraftRoutedStep;
  routing: Extract<NonNullable<AutomationStudioFlowDraftStep["routing"]>, { kind: "repeat" }>;
  index: number;
  byId: ReadonlyMap<string, AutomationStudioFlowDraftRoutedStep>;
  positionOf: ReadonlyMap<string, number>;
  emitted: AutomationStudioFlowScriptStep[];
  consumed: Set<string>;
  label: (id: string) => string;
  nextDerived: (kind: string) => string;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): { code: string; message: string } | undefined {
  const { routing, entry, emitted } = input;
  const over = input.byId.get(routing.over);
  const through = input.byId.get(routing.through);
  const overAt = input.positionOf.get(routing.over) ?? -1;
  const throughAt = input.positionOf.get(routing.through) ?? -1;
  if (!over || !through || throughAt < input.index) return { code: "flow_draft.repeat_span_unknown", message: `Step ${entry.step.position} repeats through a step that is not in the Flow after it.` };
  if (overAt !== input.index - 1) return { code: "flow_draft.repeat_not_after_its_source", message: `Step ${entry.step.position} repeats over step ${over.step.position}, which has to be the step immediately before the span. Move it there with an amend_draft reorder, or say repeat with no over to mean the step before this one.` };
  const body = [...input.byId.values()].slice(input.index, throughAt + 1);
  if (body.some((candidate, offset) => offset > 0 && candidate.step.routing !== undefined)) {
    return { code: "flow_draft.repeat_body_is_routed", message: `Step ${entry.step.position} repeats a span in which another step also says when it runs. Say it once, on the first step of the span.` };
  }
  const head = emitted[emitted.length - 1];
  if (!head || head.label !== input.label(routing.over)) return { code: "flow_draft.repeat_not_after_its_source", message: `Step ${entry.step.position} repeats over a step that is not the one before it in the Flow.` };
  const loop = input.nextDerived("loop");
  const exit = input.nextDerived("exit");
  const rows = listPort(over, input.registry, input.resolution);
  const first = input.label(automationStudioFlowDraftStepId(body[0]!.step));
  if (rows) {
    // A list is read once and walked. The rows go into For Each's own list
    // port by name: taking whichever way in was free would wire the rows as
    // the path and the Flow would walk nothing.
    const each = input.nextDerived("each");
    head.branches = [...head.branches, branch("success", loop, "branches"), branch(rows, each, "items")];
    head.routed = true;
    emitted.push(mergeStep(loop, "each pass of the loop starts here"));
    emitted.push({ label: each, description: "run the span once for each row", node: FOR_EACH_NODE_ID, entries: [], branches: [branch("body", first), branch("done", exit)], routed: true, line: 0 });
  } else {
    // A check is re-run every pass, so it belongs inside the loop rather than
    // before it: it is lifted out of the line it was written in and put after
    // the head, which is what makes "while it still holds" true.
    emitted.pop();
    emitted.push(mergeStep(loop, "each pass of the loop starts here"));
    emitted.push({ ...head, branches: [...head.branches, branch("success", first), branch("failed", exit)], routed: true });
  }
  for (const [offset, member] of body.entries()) {
    const memberId = automationStudioFlowDraftStepId(member.step);
    input.consumed.add(memberId);
    const last = offset === body.length - 1;
    emitted.push({
      ...scriptStep(member, input.label(memberId)),
      // The last step of the span goes back to the head rather than on: the
      // join is where several paths may arrive, so the loop closes there.
      ...(last ? { branches: [branch("success", loop, "branches")], routed: true } : {})
    });
  }
  emitted.push(mergeStep(exit, "the Flow carries on from here when the loop is done"));
  return undefined;
}

/**
 * The output port a step's node puts a list of rows on, when it declares one.
 *
 * Found through the same matcher the assembler uses, never by looking the
 * written name up as an id: a step names its node the way the catalog printed
 * it and the assembler matches that, so asking the registry directly would
 * answer "no list" for a node that has one and quietly build the wrong loop.
 */
function listPort(
  entry: AutomationStudioFlowDraftRoutedStep,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution
): string | undefined {
  const written = entry.written.node ?? entry.written.description;
  const definition: AutomationStudioNodeDefinition | undefined = matchAuthoringDefinition(written, registry.list(resolution)).definition;
  return definition?.outputs.find((port) => port.valueType === "array")?.id;
}

function scriptStep(entry: AutomationStudioFlowDraftRoutedStep, label: string | undefined): AutomationStudioFlowScriptStep {
  return {
    ...(label ? { label } : {}),
    description: entry.written.description,
    ...(entry.written.node ? { node: entry.written.node } : {}),
    entries: entry.written.entries ?? [],
    branches: [],
    line: 0
  };
}

function mergeStep(label: string, description: string): AutomationStudioFlowScriptStep {
  return { label, description, node: MERGE_NODE_ID, entries: [], branches: [], line: 0 };
}

function branch(port: string, target: string, targetPort?: string): AutomationStudioFlowScriptBranch {
  return { port, target, ...(targetPort ? { targetPort } : {}), line: 0 };
}
