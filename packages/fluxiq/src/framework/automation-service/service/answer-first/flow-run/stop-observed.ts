// A stop is told as the page is when the run hands over (t1088, live kestrel run-mwz2jc4w attempt 2).
//
// A step's recorded effect is looked for while the step runs, over a short window. A page that stands
// between the act and its result for longer than that (a bot check that lets the visitor on after a few
// seconds) fails the step as `effect_not_seen`, and the results arrived about 2.5 s after the stop. The
// handoff then said "The page is where it left it", which was false by then, and the model explored again.
//
// So before a stop of that kind is handed over, the page is read **once** and the stopped step's effect is
// asked again through the host's own `routeEffectHolds`, the question a run already puts to the page for a
// step it cannot run (`engine/automation/state-routing/decision.ts`, `effectHolds`).
//
// - **It holds:** the run goes on from the step after the stopped one, in the same attempt. The stopped step
//   is never run again, so a lasting act is not made twice.
// - **It does not:** the note says what the page shows now (its site, never a word of its path).
//
// No wait is added and no retry: one observation at the moment of handoff.

import type { JsonObject } from "../../../../../core/index.ts";
import { chooseAutomationStudioEdge } from "../../../../../engine/automation/graph-navigation/index.ts";
import { AUTOMATION_STUDIO_RECORDED_EFFECT_UNSEEN_FAILURE } from "../../../../../engine/automation/node-execution/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../../runtime/automation-host/index.ts";
import { automationStudioNodeRouteSignatures, automationStudioRouteEffectHolds, observeAutomationStudioRouteState } from "../../../../../runtime/automation-host/route-state/index.ts";
import { automationStudioUnresolvedFailedAttempt } from "../../../../../runtime/adaptation/recovery/index.ts";
import { automationStudioActivityPageName } from "../../../../../runtime/automation-activity/wording/index.ts";
import type { AutomationStudioAnswerFirstFlowRunEnded } from "./steps-ran.ts";

const SYMBOLIC_KEY = "bootstrapSymbolicKey";

export type AutomationStudioAnswerFirstFlowRunStopSeen =
  /** The stopped step's effect is on the page now: go on from `fromKey`, the plan key of the step after it. */
  | { kind: "holds"; nodeId: string; fromKey: string }
  /** It is not: the page as it is, named by its site where it has one (`page`). */
  | { kind: "page"; page?: string };

/** What the page shows at the moment of handoff, for a stop on an unseen effect. Nothing for any other stop. Never throws. */
export async function automationStudioAnswerFirstFlowRunStopSeen(input: {
  ended: AutomationStudioAnswerFirstFlowRunEnded;
  hostRuntime: AutomationStudioHostRuntimeBoundary | undefined;
  projectId: string;
  flowId: string;
  startLocation?: string | undefined;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioAnswerFirstFlowRunStopSeen | undefined> {
  const { ended } = input;
  const graph = ended.graph;
  if (ended.reachedEnd || !graph || !ended.trace || input.signal?.aborted === true) return undefined;
  const failed = automationStudioUnresolvedFailedAttempt(ended.trace.attempts);
  if (failed?.failure?.code !== AUTOMATION_STUDIO_RECORDED_EFFECT_UNSEEN_FAILURE.code || !failed.nodeId) return undefined;
  const node = graph.nodes.find((candidate) => candidate.id === failed.nodeId);
  if (!node) return undefined;
  const observation = await observeAutomationStudioRouteState({ hostRuntime: input.hostRuntime, projectId: input.projectId, flowId: input.flowId, ...(input.signal ? { signal: input.signal } : {}) });
  if (!observation.ok) return undefined;
  const effect = automationStudioNodeRouteSignatures(node).effect;
  if (effect && automationStudioRouteEffectHolds(input.hostRuntime, effect, observation.state).holds) {
    const edge = chooseAutomationStudioEdge(graph, node.id, "success", node.definitionId);
    const target = edge ? graph.nodes.find((candidate) => candidate.id === edge.targetNodeId) : undefined;
    const key = target?.metadata?.[SYMBOLIC_KEY];
    // A step with no step after it, or one the plan keys do not name, has nowhere to go on from: it is told as a stop.
    if (typeof key === "string") return { kind: "holds", nodeId: node.id, fromKey: key };
  }
  const page = nameOf(observation.state, input.startLocation);
  return { kind: "page", ...(page ? { page } : {}) };
}

/** The page's own address and title, as the host's state carries them, put in plain words (`automationStudioActivityPageName`). */
function nameOf(state: JsonObject, startLocation: string | undefined): string | undefined {
  const page = state.page;
  if (!page || typeof page !== "object" || Array.isArray(page)) return undefined;
  return automationStudioActivityPageName({ url: page.location, title: page.title }, startLocation);
}
