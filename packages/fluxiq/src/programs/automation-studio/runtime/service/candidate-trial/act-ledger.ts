// A trial's per-pass act ledger (t796; debug `run-mvtdn37t-e1e4d0a7`, "the
// structural answer"): for every pass of a repeat, and for the run outside
// one, what each tracked step did on that pass. Pure.
//
// **Why.** Run `run-mvtdn37t-e1e4d0a7` wrote its act step `only after:` an
// optional step whose control was absent on every pass. A guard routes past the
// steps written so (`../../executor/step-skip/guarded-group.ts`), and a step
// gone past has no attempt, so the trial's feedback, which lists each step that
// ran (`./feedback.ts`), never named it: the act step never ran on any of 21
// passes and neither the model nor the judges were told. The ledger is read off
// the trial's own folded steps (`./executed-steps.ts`) and the graph it ran, so
// a step that has no attempt on a pass is said too, with why.
//
// **Tracked steps.** A step that does a lasting act, as the run reads one
// (`automationStudioNodeActLasts`: marked as acting, or its step declared a
// consequence; never one of Core's own nodes that acts on nothing outside the
// run, as `./landed-acts.ts` reads them), and a step of an optional step's
// guarded group, lasting or not (the wait written after a notice is closed).
//
// **Passes.** A loop node's attempt that takes `body` begins its next pass, one
// count per loop node across the trial; one that takes any other route leaves
// it. Loops nest: an inner loop's pass is inside its outer loop's. A tracked
// step belongs to the innermost loop whose body the graph says it is in (every
// node its `body` port reaches without passing back through the loop, less what
// its way on also reaches, as `../../executor/graph-navigation/zero-pass-loop.ts`
// reads a body). A loop that took its body on no pass -- it ran no passes, or
// the run never reached it -- puts nothing in the ledger: a loop with no rows
// is a valid ending (`./reads.ts` says why), and a step the run never reached
// in a failed run is said by its failure. A step outside every loop has one
// pass, the run itself, numbered nothing.
//
// **Each pass** (the step's last attempt on it, numbered as the feedback numbers
// it): `ran` (with a lasting step's act: `changed` when it landed by
// `./landed-acts.ts`, `already_in_state` when its try failed with the page
// already showing its effect, else `no_change_seen`), `skipped`, `refused`
// (another row's control, or a covering layer), `failed`, or with no attempt
// `not_run`: `guarded` where its guard was reached on that pass and gone past
// (skipped or failed), naming the guard by its label; otherwise `unreached`.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowNode } from "../../../model/index.ts";
import { controlFlowNodes } from "../../../nodes/control-flow/index.ts";
import { automationStudioNodeActLasts, automationStudioNodeSideEffectClass, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { automationStudioOptionalStepGuardedGroup } from "../../executor/step-skip/index.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";
import type { AutomationStudioTrialActLedgerEntry, AutomationStudioTrialActLedgerPass } from "./contracts.ts";
import { automationStudioTrialExecutedSteps } from "./executed-steps.ts";
import { automationStudioCandidateTrialLandedActs } from "./landed-acts.ts";
import { automationStudioTrialStepControl } from "./step-control.ts";

/** The loop nodes whose `body` port begins a pass. */
const LOOP_DEFINITION_IDS: ReadonlySet<string> = new Set(["builtin.control.for-each", "builtin.control.repeat", "builtin.control.loop"]);
/** Per loop definition, the output ports that carry a value and never the run (as `zero-pass-loop.ts` reads them). */
const VALUE_PORTS: ReadonlyMap<string, ReadonlySet<string>> = new Map(controlFlowNodes
  .filter((definition) => LOOP_DEFINITION_IDS.has(definition.id))
  .map((definition) => [definition.id, new Set(definition.outputs.filter((port) => port.role === "data").map((port) => port.id))]));
/** Core's own nodes; those whose side-effect class is `none` act on nothing outside the run (`./landed-acts.ts`). */
const CORE_NODE_PREFIX = "builtin.";
/** Where the build stamps a node's plan key (`../../flow-bootstrap/adaptation.ts`). */
const SYMBOLIC_KEY_METADATA = "bootstrapSymbolicKey";
/** A press refused because a layer covered its control, whichever domain carried it (`../../llm/repeat-guard/covered-refused.ts`). */
const COVERED_REFUSED = /(?:^|[._])(?:target_covered|blocked_by_dialog)$/u;

type Folded = ReturnType<typeof automationStudioTrialExecutedSteps>;

/** A skipped attempt's reason as the ledger says it. */
const SKIPPED_WHY: Readonly<Record<NonNullable<AutomationStudioNodeAttemptTrace["skipped"]>["reason"], Extract<AutomationStudioTrialActLedgerPass, { status: "skipped" }>["why"]>> = Object.freeze({
  target_absent: "absent", already_in_state: "already_in_state", already_done: "already_done", state_routed: "state_routed"
});

/** The trial's act ledger (header): one entry per tracked step, in the graph's node order; none without a graph. */
export function automationStudioTrialActLedger(trace: AutomationStudioGraphExecutionTrace | undefined, artifact: AutomationStudioFlowArtifact | undefined): AutomationStudioTrialActLedgerEntry[] {
  if (!artifact) return [];
  // A graph read with no edges (or nodes) listed has none, as the feedback reads one.
  const graph = { ...artifact, nodes: artifact.nodes ?? [], edges: artifact.edges ?? [] };
  const steps = automationStudioTrialExecutedSteps(trace?.attempts ?? []);
  const landed = new Set(automationStudioCandidateTrialLandedActs(trace, artifact).map((act) => act.step));
  const guardOf = new Map<string, AutomationStudioFlowNode>();
  for (const node of graph.nodes) for (const id of automationStudioOptionalStepGuardedGroup(graph, node)?.steps ?? []) guardOf.set(id, node);
  const loopOf = innermostLoops(graph);
  const { at, counts } = passesOf(steps);
  const entries: AutomationStudioTrialActLedgerEntry[] = [];
  for (const node of graph.nodes) {
    const lasting = actLasts(node);
    const guard = guardOf.get(node.id);
    if (!lasting && !guard) continue;
    const loop = loopOf.get(node.id);
    const of = loop === undefined ? 1 : counts.get(loop) ?? 0;
    if (!of) continue;
    const passes: AutomationStudioTrialActLedgerPass[] = [];
    for (let number = 1; number <= of; number += 1) {
      const onPass = (index: number) => loop === undefined || at[index]?.get(loop) === number;
      const own = lastIndex(steps, (step, index) => step.attempt.nodeId === node.id && onPass(index));
      const numbered = loop === undefined ? {} : { pass: number };
      if (own !== undefined) {
        passes.push({ ...numbered, ...ranOn(steps[own]!.attempt, own + 1, lasting, landed) });
        continue;
      }
      const guarded = guard ? lastIndex(steps, (step, index) => step.attempt.nodeId === guard.id && onPass(index)) : undefined;
      passes.push(guard && guarded !== undefined && !done(steps[guarded]!.attempt)
        ? { ...numbered, status: "not_run", why: "guarded", after: labelOf(guard) }
        : { ...numbered, status: "not_run", why: "unreached" });
    }
    const key = node.metadata?.[SYMBOLIC_KEY_METADATA];
    entries.push({
      nodeId: node.id, definitionId: node.definitionId, label: labelOf(node), ...(typeof key === "string" && key ? { key } : {}), lasting,
      ...(guard ? { guard: { nodeId: guard.id, label: labelOf(guard) } } : {}),
      ...(loop !== undefined ? { repeat: { nodeId: loop, passes: of } } : {}),
      passes
    });
  }
  return entries;
}

/** Whether the node's act lasts as the run reads it, Core's own nodes that act on nothing outside the run excepted (header). */
function actLasts(node: AutomationStudioFlowNode): boolean {
  if (node.definitionId.startsWith(CORE_NODE_PREFIX) && automationStudioNodeSideEffectClass(node) === "none") return false;
  return automationStudioNodeActLasts(node);
}

/** What the step's last attempt on a pass came to (header). */
function ranOn(attempt: AutomationStudioNodeAttemptTrace, step: number, lasting: boolean, landed: ReadonlySet<number>): AutomationStudioTrialActLedgerPass {
  const skipped = attempt.skipped;
  if (skipped) {
    const row = "row" in skipped && skipped.row !== undefined ? { row: skipped.row } : {};
    return { step, ...row, status: "skipped", why: SKIPPED_WHY[skipped.reason] };
  }
  if (attempt.stateHeld) return { step, status: "ran", ...(lasting ? { act: "already_in_state" as const } : {}) };
  if (automationStudioAttemptSettled(attempt).status === "succeeded") return { step, status: "ran", ...(lasting ? { act: landed.has(step) ? "changed" as const : "no_change_seen" as const } : {}) };
  if (refusedAsOtherRow(attempt)) return { step, status: "refused", why: "other_row" };
  const code = attempt.failure?.code;
  if (code !== undefined && COVERED_REFUSED.test(code)) return { step, status: "refused", why: "covered" };
  return { step, status: "failed", ...(code !== undefined ? { code } : {}) };
}

/** Whether a guard's attempt was done on its pass: it settled done and was not skipped (header). */
function done(attempt: AutomationStudioNodeAttemptTrace): boolean {
  return !attempt.skipped && automationStudioAttemptSettled(attempt).status === "succeeded";
}

/** Whether the client refused the attempt's match as another row's control (`./target-on-page.ts`, t792). */
function refusedAsOtherRow(attempt: AutomationStudioNodeAttemptTrace): boolean {
  let at: JsonValue | undefined = attempt.outputs;
  for (const key of ["result", "result", "resolution"]) at = typeof at === "object" && at !== null && !Array.isArray(at) ? at[key] : undefined;
  return typeof at === "object" && at !== null && !Array.isArray(at) && at.refusedBecause === "other-record";
}

/** The words a step is named by: its label, else its control's words, else its definition. */
function labelOf(node: AutomationStudioFlowNode): string {
  return node.label?.trim() || automationStudioTrialStepControl(node, undefined) || node.definitionId;
}

/**
 * Each folded step's pass of every loop it ran inside (loop node id -> pass
 * number), and how many passes each loop ran (header). A loop's `body` route
 * begins its next pass, inside the loops still open around it; any other
 * route of it closes it and every loop opened inside it.
 */
function passesOf(steps: Folded): { at: Array<ReadonlyMap<string, number>>; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  let open: Array<{ loop: string; number: number }> = [];
  const at = steps.map(({ attempt }) => {
    const here = new Map(open.map(({ loop, number }) => [loop, number]));
    if (LOOP_DEFINITION_IDS.has(attempt.definitionId)) {
      const inside = open.findIndex((entry) => entry.loop === attempt.nodeId);
      if (inside >= 0) open = open.slice(0, inside);
      if (attempt.route === "body") {
        const number = (counts.get(attempt.nodeId) ?? 0) + 1;
        counts.set(attempt.nodeId, number);
        open.push({ loop: attempt.nodeId, number });
      }
    }
    return here;
  });
  return { at, counts };
}

/** Each node in a loop's body, by the innermost such loop: the loop with the fewest body nodes (header). */
function innermostLoops(graph: AutomationStudioFlowArtifact): Map<string, string> {
  const bodies = graph.nodes.filter((node) => LOOP_DEFINITION_IDS.has(node.definitionId)).map((loop) => ({ loop: loop.id, body: bodyOf(graph, loop) }));
  const innermost = new Map<string, { loop: string; size: number }>();
  for (const { loop, body } of bodies) {
    for (const id of body) {
      const known = innermost.get(id);
      if (!known || body.size < known.size) innermost.set(id, { loop, size: body.size });
    }
  }
  return new Map([...innermost].map(([id, { loop }]) => [id, loop]));
}

/** Every node a loop's `body` reaches without passing back through it, less every node its way on also reaches. */
function bodyOf(graph: AutomationStudioFlowArtifact, loop: AutomationStudioFlowNode): Set<string> {
  const out = graph.edges.filter((edge) => edge.sourceNodeId === loop.id && edge.targetNodeId !== loop.id);
  const body = reachedAvoiding(graph, out.filter((edge) => edge.sourcePortId === "body").map((edge) => edge.targetNodeId), loop.id);
  const values = VALUE_PORTS.get(loop.definitionId);
  const onward = reachedAvoiding(graph, out.filter((edge) => edge.sourcePortId !== "body" && !(edge.sourcePortId !== undefined && values?.has(edge.sourcePortId))).map((edge) => edge.targetNodeId), loop.id);
  for (const id of onward) body.delete(id);
  return body;
}

/** Every node reached from `starts` along edges, never entering or passing through `avoid`. */
function reachedAvoiding(graph: AutomationStudioFlowArtifact, starts: readonly string[], avoid: string): Set<string> {
  const seen = new Set(starts.filter((id) => id !== avoid));
  const queue = [...seen];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const edge of graph.edges) {
      if (edge.sourceNodeId !== id || edge.targetNodeId === avoid || seen.has(edge.targetNodeId)) continue;
      seen.add(edge.targetNodeId);
      queue.push(edge.targetNodeId);
    }
  }
  return seen;
}

/** The index of the last folded step that matches, or none. */
function lastIndex(steps: Folded, matches: (step: Folded[number], index: number) => boolean): number | undefined {
  for (let index = steps.length - 1; index >= 0; index -= 1) if (matches(steps[index]!, index)) return index;
  return undefined;
}
