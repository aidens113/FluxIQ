import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../model/index.ts";
import type { AutomationNodeExpectationEvaluation, AutomationNodeExpectationEvaluationContext, AutomationNodeExpectationEvaluator } from "../nodes/index.ts";

export type AutomationStudioHostRuntimeCapability =
  | "action-dispatch"
  | "state-snapshot"
  | "state-diff"
  | "wait-observe"
  | "external-side-effect"
  | "rollback-hint"
  | "expectation-evaluation"
  | "route-state";

export type AutomationStudioHostStateSnapshotRef = {
  stateSnapshotId: string;
  stateRef: string;
  capturedAt: number;
  summary?: JsonObject;
  /**
   * The host's own token for putting the target back to the state this
   * snapshot was taken in: the same token its tool results state as a step's
   * `replay.from` (`llm/node-tools/replay.ts`), sent back in a reset. Core
   * carries it unread. A re-author reads it off each node's first
   * `before_action` snapshot so a rerun of a step carried from the Flow starts
   * where that node started (`llm/node-tools/run-start-pages.ts`). A host
   * writes it only when the token is one a reset can use and holds nothing it
   * would not put in evidence; without it a rerun runs where the target is,
   * and says so.
   */
  from?: JsonObject;
};

export type AutomationStudioHostRuntimeActionContext = {
  node: AutomationStudioFlowNode;
  attemptId: string;
  inputs: Readonly<Record<string, JsonValue>>;
  previousStateRef?: AutomationStudioHostStateSnapshotRef;
};

/** One `state.*` path a Router condition may test, and what it holds, in the host's own words. */
export type AutomationStudioHostRouteStatePath = {
  /** The whole path a condition writes, `state.` included. */
  path: string;
  description: string;
};

export type AutomationStudioHostRuntimeBoundary = {
  capabilities: Iterable<AutomationStudioHostRuntimeCapability | string>;
  /**
   * The state a Router's `state.*` conditions read, observed now: the host's
   * bounded, sanitized view of where a run stands before any step has run.
   * Core calls it before routing a run and while a Flow is being built, so
   * the router decides on the state the model was shown. It is evaluated
   * where it is observed and never persisted; a host returns nothing it would
   * not put in evidence.
   */
  observeRouteState?(input: { projectId: string; flowId: string; signal?: AbortSignal }): JsonObject | Promise<JsonObject>;
  /** The `state.*` paths `observeRouteState` fills, so a model can write a condition on one that is absent right now. */
  routeStatePaths?: readonly AutomationStudioHostRouteStatePath[];
  /**
   * One route state, as the compact signature a Flow node keeps of the page it
   * started on and the page it left (`route-state/signatures/`). Pure and
   * synchronous; Core stores the answer on the node and never reads inside it,
   * so a host returns nothing it would not put in a Flow document -- hashes,
   * not page text. Without it no node records a pre-state.
   */
  signRouteState?(state: JsonObject): JsonObject;
  /**
   * Whether the page a recorded signature describes is the page observed now,
   * and how close the two are, 0 to 1. Pure and synchronous. This is how a run
   * finds the node whose expected pre-state holds when a step cannot run
   * (`executor/state-routing/`); without it, two signatures match only when
   * they are structurally equal.
   */
  compareRouteSignatures?(recorded: JsonObject, observed: JsonObject): { matches: boolean; closeness: number };
  /**
   * What one step did to the page, from the route state before it and the route
   * state after it, as a compact record a Flow node keeps beside its signatures.
   * Pure and synchronous, and as opaque to Core as a signature.
   */
  signRouteEffect?(before: JsonObject, after: JsonObject): JsonObject;
  /**
   * Whether the page observed now already shows a step's recorded effect: the
   * route state as `observeRouteState` returned it, not a signature, so the host
   * can test it exactly. True only on positive evidence; an effect that records
   * nothing the page gained says nothing, and is false. A run reads it for a
   * step it cannot run: the site already did what the step does -- a store
   * already chosen, a page already turned -- so the run goes on past it.
   */
  routeEffectHolds?(effect: JsonObject, observed: JsonObject): boolean;
  captureStateSnapshot?(input: AutomationStudioHostRuntimeActionContext & { point: "before_action" | "after_action" | "after_wait_retry" | "after_patch_test" }): AutomationStudioHostStateSnapshotRef | Promise<AutomationStudioHostStateSnapshotRef>;
  inspectStateDiff?(input: { before?: AutomationStudioHostStateSnapshotRef; after?: AutomationStudioHostStateSnapshotRef; node: AutomationStudioFlowNode; attemptId: string }): JsonObject | Promise<JsonObject>;
  rollbackHint?(input: AutomationStudioHostRuntimeActionContext): JsonObject | Promise<JsonObject>;
  /**
   * Decides whether an expected state holds. Bound with the rest of the host
   * runtime, so a host that binds nothing keeps Core's unconditional pass.
   */
  expectationEvaluator?(conditions: JsonValue[], mode: string, timeoutMs: number, context: AutomationNodeExpectationEvaluationContext): AutomationNodeExpectationEvaluation | Promise<AutomationNodeExpectationEvaluation>;
};

export function hostExpectationEvaluator(hostRuntime: AutomationStudioHostRuntimeBoundary | undefined): AutomationNodeExpectationEvaluator | undefined {
  const evaluate = hostRuntime?.expectationEvaluator;
  if (!evaluate) return undefined;
  return (conditions, mode, timeoutMs, context) => evaluate.call(hostRuntime, conditions, mode, timeoutMs, context);
}

export function hostRuntimeCapabilityIds(hostRuntime: AutomationStudioHostRuntimeBoundary | undefined): string[] {
  return [...new Set([...(hostRuntime?.capabilities ?? [])].map(String).filter(Boolean))].sort();
}
