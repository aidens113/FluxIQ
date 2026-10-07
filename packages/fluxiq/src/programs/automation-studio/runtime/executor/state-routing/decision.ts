import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import {
  automationStudioCompareRouteSignatures,
  automationStudioNodeRouteSignatures,
  automationStudioRouteEffectHolds,
  automationStudioSignRouteState,
  observeAutomationStudioRouteState
} from "../../route-state/passive/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { chooseAutomationStudioEdge } from "../graph-navigation.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace, AutomationStudioStateRouteDirection, AutomationStudioStateRoutingRecord } from "../contracts.ts";
import { automationStudioAbsentStepSkip } from "../step-skip/index.ts";
import { AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT, automationStudioRunProgressMark, type AutomationStudioStateRouteGuard } from "./progress-guard.ts";
import { automationStudioRankStateRoutes, type AutomationStudioStateRouteMatch } from "./ranking.ts";

/**
 * What a run does with a step that cannot run.
 *
 * - `declared`: the Flow itself says where the page is -- a sometimes-present
 *   step's way on (`step-skip/absent-step.ts`), taken with no observation.
 * - `routed`: the page already shows the failing step's own effect, and the
 *   run goes on along its success `edge` to `node` (record outcome
 *   `effect_holds`); or the page matched `node`'s recorded pre-state, and the
 *   run goes on there (record outcome `routed`, with its `closeness`).
 * - `stopped`: the match was one return too many to the same node without
 *   progress; the run ends failed with `message`.
 * - `none`: no way on was found; the recovery ladder runs exactly as before.
 */
export type AutomationStudioStateRouteDecision =
  | { kind: "declared"; edge: AutomationStudioFlowEdge }
  | { kind: "routed"; node: AutomationStudioFlowNode; direction: AutomationStudioStateRouteDirection; closeness?: number; edge?: AutomationStudioFlowEdge; record: AutomationStudioStateRoutingRecord }
  | { kind: "stopped"; message: string; record: AutomationStudioStateRoutingRecord }
  | { kind: "none"; record: AutomationStudioStateRoutingRecord };

export type AutomationStudioStateRouteInput = {
  flow: AutomationStudioFlowDocument;
  /** The step that cannot run. */
  node: AutomationStudioFlowNode;
  /** Its failed attempt, or the one synthesized when its readiness gate did not hold. */
  attempt: Pick<AutomationStudioNodeAttemptTrace, "status" | "failure">;
  /** Every attempt of the run so far. */
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  options: Pick<AutomationStudioGraphExecutionOptions, "hostRuntime" | "signal">;
  guard: AutomationStudioStateRouteGuard;
};

/**
 * Decides, for a step that cannot run, where the run continues -- before any
 * recovery rung or model call (`docs/architecture/automation-studio.md`, "A
 * step that cannot run continues where the page is"):
 *
 * 1. The Flow's declared way on past a sometimes-present step, unobserved.
 * 2. Every other node with a recorded pre-state is a candidate. With none, and
 *    no effect of the failing step's own to test, nothing is observed.
 * 3. The page is observed, once. When the failing step recorded its effect and
 *    has a success edge, the host is asked whether the page already shows that
 *    effect -- the site already did what the step does (a store already
 *    chosen). If it does, the run goes on along that edge, forward, through
 *    the progress guard. If not, matching goes on with the same observation,
 *    signed through the host.
 * 4. Each candidate's pre-state is compared with it. A node that already acted
 *    in this run is passed over when its recorded after-state also holds (its
 *    effect still stands) or it recorded none (nothing shows the effect is
 *    gone). The failing node is never a candidate: its target is missing.
 * 5. The best match is chosen (`ranking.ts`) and admitted by the progress guard.
 */
export async function decideAutomationStudioStateRoute(input: AutomationStudioStateRouteInput): Promise<AutomationStudioStateRouteDecision> {
  const declared = automationStudioAbsentStepSkip(input.flow, input.node, input.attempt);
  if (declared) return { kind: "declared", edge: declared };
  const candidates = input.flow.nodes
    .filter((node) => node.id !== input.node.id)
    .map((node) => ({ node, signatures: automationStudioNodeRouteSignatures(node) }))
    .filter((candidate) => candidate.signatures.before !== undefined);
  const own = ownEffect(input.flow, input.node);
  if (!candidates.length && !own) return none("no_pre_states", 0);
  const hostRuntime = input.options.hostRuntime;
  const observation = await observeAutomationStudioRouteState({ hostRuntime, ...flowScope(input.flow), ...(input.options.signal ? { signal: input.options.signal } : {}) });
  if (!observation.ok) return none("unobserved", candidates.length, observation.reason);
  const held = own ? effectHolds(input, own, observation.state, candidates.length) : undefined;
  if (held && held.kind !== "none") return held;
  const notShown = held?.kind === "none" && held.record.reason ? `${held.record.reason} ` : "";
  if (!candidates.length) return none("no_match", 0, `${notShown}No other step recorded an expected starting page.`);
  const signed = automationStudioSignRouteState(hostRuntime, observation.state);
  if (!signed.ok) return none("unobserved", candidates.length, `${signed.reason} So the page could not be compared with any step's.`);
  const observed = signed.signature;
  const acted = actedNodeIds(input.attempts);
  const matches: AutomationStudioStateRouteMatch[] = [];
  let effectStands = 0;
  for (const { node, signatures } of candidates) {
    const before = automationStudioCompareRouteSignatures(hostRuntime, signatures.before!, observed);
    if (!before.matches) continue;
    if (acted.has(node.id) && (!signatures.after || automationStudioCompareRouteSignatures(hostRuntime, signatures.after, observed).matches)) {
      effectStands += 1;
      continue;
    }
    matches.push({ node, closeness: before.closeness });
  }
  const best = automationStudioRankStateRoutes(input.flow, input.node.id, matches)[0];
  if (!best) {
    return none("no_match", candidates.length, notShown + (effectStands
      ? `${effectStands} step(s) expected this page but had already acted, and nothing shows their effect is gone.`
      : "The page matched no step's expected starting page."));
  }
  const record = { candidates: candidates.length, matched: matches.length, toNodeId: best.node.id, direction: best.direction, closeness: best.closeness };
  const stopped = guarded(input, best.node.id, record, `the page matched only node ${best.node.id}'s expected starting page`);
  return stopped ?? { kind: "routed", node: best.node, direction: best.direction, closeness: best.closeness, record: { outcome: "routed", ...record } };
}

/** The failing step's own effect and the success edge it would take: present only when it recorded one and the edge leads to a node. */
type OwnEffect = { effect: JsonObject; edge: AutomationStudioFlowEdge; target: AutomationStudioFlowNode };

function ownEffect(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode): OwnEffect | undefined {
  const effect = automationStudioNodeRouteSignatures(node).effect;
  if (!effect) return undefined;
  const edge = chooseAutomationStudioEdge(flow, node.id, "success", node.definitionId);
  const target = edge ? flow.nodes.find((candidate) => candidate.id === edge.targetNodeId) : undefined;
  return edge && target ? { effect, edge, target } : undefined;
}

/**
 * Whether the page already shows the failing step's own effect, on the host's
 * positive answer. If it does, the run goes on along the step's success edge,
 * forward, admitted by the progress guard like any route. If not, the answer
 * is `none` with the host's reason, and matching goes on.
 */
function effectHolds(input: AutomationStudioStateRouteInput, own: OwnEffect, observed: JsonObject, candidates: number): AutomationStudioStateRouteDecision {
  const reading = automationStudioRouteEffectHolds(input.options.hostRuntime, own.effect, observed);
  if (!reading.holds) return none("no_match", candidates, reading.reason);
  const record = { candidates, matched: 0, toNodeId: own.target.id, direction: "forward" as const };
  const stopped = guarded(input, own.target.id, record, `the page already showed what it does, which leads only to node ${own.target.id}`);
  return stopped ?? { kind: "routed", node: own.target, direction: "forward", edge: own.edge, record: { outcome: "effect_holds", ...record } };
}

/** Admits a route into `toNodeId` through the progress guard, or returns the decision that stops the run on one return too many. */
function guarded(
  input: AutomationStudioStateRouteInput,
  toNodeId: string,
  record: Omit<AutomationStudioStateRoutingRecord, "outcome">,
  why: string
): Extract<AutomationStudioStateRouteDecision, { kind: "stopped" }> | undefined {
  const admission = input.guard.admit(toNodeId, automationStudioRunProgressMark(input.attempts));
  if (admission.admitted) return undefined;
  const reason = `Node ${input.node.id} could not run each time and ${why}, so going on would loop.`;
  return {
    kind: "stopped",
    message: `The run stopped: the page returned it to node ${toNodeId} ${admission.returns} times with no progress in between, past the limit of ${AUTOMATION_STUDIO_STATE_ROUTE_RETURN_LIMIT}. ${reason}`,
    record: { outcome: "guard_stopped", ...record, reason }
  };
}

function none(outcome: "no_match" | "unobserved" | "no_pre_states", candidates: number, reason?: string): AutomationStudioStateRouteDecision {
  return { kind: "none", record: { outcome, candidates, matched: 0, ...(reason ? { reason } : {}) } };
}

/** The nodes that acted in this run: an attempt that succeeded and was not skipped. */
function actedNodeIds(attempts: readonly AutomationStudioNodeAttemptTrace[]): Set<string> {
  return new Set(attempts.filter((attempt) => attempt.status === "succeeded" && !attempt.skipped).map((attempt) => attempt.nodeId));
}

/**
 * The project and Flow the host is asked to observe for. A graph run is handed
 * a Flow document and no project id, so the project is the document's own
 * `metadata.projectId` when it carries one, else its `ownerId` (the project for
 * a compiled plan, the Flow itself for a canonical Flow). The web host reads
 * the page it is on and uses neither.
 */
function flowScope(flow: AutomationStudioFlowDocument): { projectId: string; flowId: string } {
  const projectId = flow.metadata?.projectId;
  return { projectId: typeof projectId === "string" && projectId ? projectId : flow.ownerId, flowId: flow.flowId };
}
