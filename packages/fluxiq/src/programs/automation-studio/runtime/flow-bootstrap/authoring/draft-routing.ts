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
//               (the join is the step after it when that step is already a
//               Merge -- a Flow read back as a draft carries its own)
//   only_if     check.failed -> join         check.success falls into the step
//   on_failed   step.failed -> the other     step.success -> join
//   repeat      a Merge at the head of the loop, a Merge at its exit, and the
//               last step of the span wired back to the head; over a list,
//               For Each's `item` also goes to each step that declares `item`
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
//
// **A step the host says answered an interruption is optional here** when it
// does none of the person's acts and says nothing else about when it runs
// (`runtime/flow-draft/sometimes-present.ts`): a consent wall or popup the
// site remembers is absent on the next visit, and playback skips an absent
// optional step. That is the step's effective routing, read here; the draft
// itself is not rewritten, so the model is shown what it said.

import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftInterruptionStepIds, automationStudioFlowDraftStepId } from "../../flow-draft/index.ts";
import type { AutomationStudioRouteSignatures } from "../../route-state/index.ts";
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

/**
 * The port a list loop's current row travels on: For Each's `item` output, and
 * the optional input of the same name that a node able to act on "the row this
 * pass is on" declares after its control input.
 */
const ROW_PORT = "item";

/** One step of the draft, already written down in the caller's vocabulary. */
export type AutomationStudioFlowDraftRoutedStep = {
  step: AutomationStudioFlowDraftStep;
  written: Pick<AutomationStudioFlowScriptStep, "description" | "node" | "entries">;
  /** The pages the step ran between, as the build signed them (`AutomationStudioFlowScriptStep.routeSignatures`). */
  routeSignatures?: AutomationStudioRouteSignatures;
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
  const steps = effectiveSteps(input.steps);
  const byId = new Map(steps.map((entry) => [automationStudioFlowDraftStepId(entry.step), entry] as const));
  const consumed = new Set<string>();
  const positionOf = new Map([...byId.keys()].map((id, index) => [id, index] as const));
  let derived = 0;
  const label = (id: string): string => id.toLowerCase();
  const nextDerived = (kind: string): string => `${kind}${(derived += 1)}`;
  const refuse = (step: AutomationStudioFlowDraftStep, code: string, message: string): void => {
    issues.push(authoringError(code, message, `draft.steps.${step.position}`));
  };
  const needsLibrary = steps.some((entry) => entry.step.routing !== undefined);
  if (needsLibrary) {
    for (const id of [MERGE_NODE_ID, FOR_EACH_NODE_ID]) {
      if (input.registry.get(id, input.resolution)) continue;
      issues.push(authoringError("flow_draft.routing_unavailable", `A Flow that branches or repeats needs "${id}", which this library does not offer.`, "draft"));
      return { steps: [], issues };
    }
  }

  for (const [index, entry] of steps.entries()) {
    const id = automationStudioFlowDraftStepId(entry.step);
    if (consumed.has(id)) continue;
    const routing = entry.step.routing;
    if (!routing) {
      emitted.push(scriptStep(entry, needsLibrary ? label(id) : undefined));
      continue;
    }
    if (routing.kind === "optional") {
      // A Flow read back as a draft already holds the Merge its optional step
      // joins at, as the step after it (`llm/node-tools/draft-from-flow.ts`).
      // Joining there keeps that node, and its id, rather than adding a second
      // join and leaving the first with one way in.
      const held = heldJoin(steps[index + 1], consumed, input.registry, input.resolution);
      if (held) {
        emitted.push({ ...scriptStep(entry, label(id)), branches: [branch("failed", label(held))] });
        continue;
      }
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
 * The steps as the Flow is written from them: each one the host says answered
 * an interruption, with no act and no routing of its own, routed `optional`.
 * A copy; the draft's own steps are left as the model authored them.
 */
function effectiveSteps(steps: readonly AutomationStudioFlowDraftRoutedStep[]): readonly AutomationStudioFlowDraftRoutedStep[] {
  const interruptions = automationStudioFlowDraftInterruptionStepIds(steps.map((entry) => entry.step));
  if (!interruptions.size) return steps;
  return steps.map((entry) => interruptions.has(automationStudioFlowDraftStepId(entry.step))
    ? { ...entry, step: { ...entry.step, routing: { kind: "optional" as const } } }
    : entry);
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
  // Three different mistakes, each said as itself. One sentence blaming
  // `through` for all three sent a live build (`run-muog33va-96469cb2`) round
  // nine refusals when it was `over` that named a step no longer in the Flow.
  if (!over) return { code: "flow_draft.repeat_span_unknown", message: `Step ${entry.step.position} repeats over a step that is not in the Flow: it was dropped or never added. Send amend_draft repeat on step ${entry.step.position} again with over naming the kept step just before it whose rows it walks.` };
  if (!through) return { code: "flow_draft.repeat_span_unknown", message: `Step ${entry.step.position} repeats through a step that is not in the Flow: it was dropped or never added. Send amend_draft repeat on step ${entry.step.position} again with through naming the last kept step of the span.` };
  if (throughAt < input.index) return { code: "flow_draft.repeat_span_unknown", message: `Step ${entry.step.position} repeats through step ${through.step.position}, which comes before it. through names the last step of the span, at or after step ${entry.step.position}; put steps in order with an amend_draft reorder first.` };
  // `over` has to come before the span, and nothing more. Steps between the
  // list and the span -- a "Not now" that appeared while the list was being
  // tuned, a rerun put back at its old place, an optional step's join -- run
  // once, before the loop. Demanding adjacency refused that shape at
  // completion, and the advice it gave ("say repeat with no over") made the
  // dismissal the loop's source: a while-loop on a press that passed every gate.
  if (overAt >= input.index) return { code: "flow_draft.repeat_not_after_its_source", message: `Step ${entry.step.position} repeats over step ${over.step.position}, which does not come before it. The list step a span walks runs before the span: move step ${over.step.position} ahead of step ${entry.step.position} with an amend_draft reorder.` };
  const body = [...input.byId.values()].slice(input.index, throughAt + 1);
  if (body.some((candidate, offset) => offset > 0 && candidate.step.routing !== undefined)) {
    return { code: "flow_draft.repeat_body_is_routed", message: `Step ${entry.step.position} repeats a span in which another step also says when it runs. Say it once, on the first step of the span.` };
  }
  // The list step's own place in the Flow, and the last thing the Flow runs
  // before the span, which is where the loop is entered from. They are one
  // entry when nothing stands between them.
  const sourceLabel = input.label(routing.over);
  const source = input.consumed.has(routing.over) ? undefined : emitted.find((candidate) => candidate.label === sourceLabel);
  const head = emitted[emitted.length - 1];
  if (!source || !head) return { code: "flow_draft.repeat_not_after_its_source", message: `Step ${entry.step.position} repeats over step ${over.step.position}, which another step already runs inside its own branch or loop, so the Flow does not reach it on its own line. Name a list step the Flow runs on its own line before step ${entry.step.position}.` };
  const loop = input.nextDerived("loop");
  const exit = input.nextDerived("exit");
  const rows = listPort(over, input.registry, input.resolution);
  const first = input.label(automationStudioFlowDraftStepId(body[0]!.step));
  // A check is asked again on every pass, so it is lifted into the loop
  // (below); lifting it over steps written after it would run them before it.
  if (!rows && source !== head) return { code: "flow_draft.repeat_not_after_its_source", message: `Step ${entry.step.position} repeats while step ${over.step.position} succeeds, and that check is asked again on every pass, so it has to be the step immediately before the span. Move step ${over.step.position} there with an amend_draft reorder.` };
  if (rows) {
    // A list is read once and walked. The rows go into For Each's own list
    // port by name: taking whichever way in was free would wire the rows as
    // the path and the Flow would walk nothing.
    const each = input.nextDerived("each");
    // The rows leave the list step itself, which keeps its fall-through into
    // whatever runs after it; the loop is entered from the last step before
    // the span, so the steps between run once, before it.
    if (source !== head) source.branches = [...source.branches, branch(rows, each, "items")];
    head.branches = [...head.branches, branch("success", loop, "branches"), ...(source === head ? [branch(rows, each, "items")] : [])];
    head.routed = true;
    // Each pass's row goes to every step of the span that can act on it --
    // one whose node declares an `item` input -- so a pass clicks the row it
    // is on rather than the same fixed element every time (live run
    // run-munnyvbr-11c28a0f). A step that declares none is left alone: its
    // node would have nowhere to put the row.
    const rowed = body
      .filter((member) => takesRow(member, input.registry, input.resolution))
      .map((member) => branch(ROW_PORT, input.label(automationStudioFlowDraftStepId(member.step)), ROW_PORT));
    emitted.push(mergeStep(loop, "each pass of the loop starts here"));
    emitted.push({ label: each, description: "run the span once for each row", node: FOR_EACH_NODE_ID, entries: [], branches: [branch("body", first), branch("done", exit), ...rowed], routed: true, line: 0 });
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
 * The id of the step after an optional one when that step is itself a Merge
 * nothing else routes, which is where the optional step's paths already meet.
 */
function heldJoin(
  next: AutomationStudioFlowDraftRoutedStep | undefined,
  consumed: ReadonlySet<string>,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution
): string | undefined {
  if (!next || next.step.routing !== undefined) return undefined;
  const id = automationStudioFlowDraftStepId(next.step);
  if (consumed.has(id)) return undefined;
  return writtenDefinition(next, registry, resolution)?.id === MERGE_NODE_ID ? id : undefined;
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
  return writtenDefinition(entry, registry, resolution)?.outputs.find((port) => port.valueType === "array")?.id;
}

/** Whether a step's node declares the input a loop hands the current row to. */
function takesRow(
  entry: AutomationStudioFlowDraftRoutedStep,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution
): boolean {
  return writtenDefinition(entry, registry, resolution)?.inputs.some((port) => port.id === ROW_PORT) === true;
}

/** The definition a step names, matched the way the assembler will match it. */
function writtenDefinition(
  entry: AutomationStudioFlowDraftRoutedStep,
  registry: AutomationStudioNodeRegistry,
  resolution: AutomationStudioNodeRegistryResolution
): AutomationStudioNodeDefinition | undefined {
  const written = entry.written.node ?? entry.written.description;
  return matchAuthoringDefinition(written, registry.list(resolution)).definition;
}

function scriptStep(entry: AutomationStudioFlowDraftRoutedStep, label: string | undefined): AutomationStudioFlowScriptStep {
  return {
    ...(label ? { label } : {}),
    description: entry.written.description,
    ...(entry.written.node ? { node: entry.written.node } : {}),
    entries: entry.written.entries ?? [],
    branches: [],
    // Which draft step this is, so the node it becomes can be traced back to
    // it. The joins and loops this module adds carry none.
    draftStepId: automationStudioFlowDraftStepId(entry.step),
    ...(entry.routeSignatures ? { routeSignatures: entry.routeSignatures } : {}),
    line: 0
  };
}

function mergeStep(label: string, description: string): AutomationStudioFlowScriptStep {
  return { label, description, node: MERGE_NODE_ID, entries: [], branches: [], line: 0 };
}

function branch(port: string, target: string, targetPort?: string): AutomationStudioFlowScriptBranch {
  return { port, target, ...(targetPort ? { targetPort } : {}), line: 0 };
}
