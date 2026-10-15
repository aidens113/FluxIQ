import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../model/index.ts";
import type { AutomationNodeExpectationEvaluation, AutomationNodeExpectationEvaluationContext, AutomationNodeExpectationEvaluator } from "../nodes/index.ts";
import type { AutomationStudioFactCondition, AutomationStudioFactTruth } from "./executor/lifecycle/index.ts";
import type { AutomationStudioHostResourcePort } from "./project-agents/host-resources/index.ts";

export type AutomationStudioHostRuntimeCapability =
  | "action-dispatch"
  | "state-snapshot"
  | "state-diff"
  | "wait-observe"
  | "external-side-effect"
  | "rollback-hint"
  | "expectation-evaluation"
  | "fact-evaluation"
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
  /**
   * On a `before_action` capture: the snapshot this host returned for the page
   * the run's previous attempt ended on, offered only when no other attempt
   * started since and it arrived moments ago (`executor/host-state.ts`). A host
   * may return it as this capture instead of reading the same page again; one
   * that ignores it captures as before.
   */
  previousStateRef?: AutomationStudioHostStateSnapshotRef;
};

/**
 * What Core hands the host beside a batch of fact conditions (state-aware
 * recovery plan, C9): the frame's bound inputs and the run's values a
 * condition's `{ input }` or `{ value }` compares with, and the node and
 * attempt the boundary is at. The host resolves those bindings from here and
 * never looks a value up itself.
 */
export type AutomationStudioFactEvaluationContext = {
  inputs?: Readonly<Record<string, JsonValue>>;
  values?: Readonly<Record<string, JsonValue>>;
  signal?: AbortSignal;
  nodeId?: string;
  attemptId?: string;
};

/**
 * The host's answer for one fact condition, by position. `result` is the
 * three-valued truth; `evidence` is the host's own bounded record of what it
 * read, which Core never stores or shows -- it keeps only a reference derived
 * from it (`executor/lifecycle-run/`) -- and `evidenceRef`, when the host keeps
 * its evidence itself, names it.
 */
export type AutomationStudioHostFactResult = {
  result: AutomationStudioFactTruth;
  evidence?: unknown;
  evidenceRef?: string | undefined;
  capturedAt: number;
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
   * The host resources agents act through -- a browser context, a device --
   * and how many may be held at once (automation-project-agents-plan, `Host
   * resources and concurrency`). Core's scheduler grants leases through it and
   * every host command an agent issues carries its lease. A host declaring a
   * capacity above 1 guarantees its resources share no lasting state. Without
   * it, Core has no resource to lease and stamps no lease on any command.
   */
  hostResources?: AutomationStudioHostResourcePort;
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
  /**
   * Whether a lasting step's recorded effect appeared on the page observed just
   * after the step answered success (t476): `seen`, `not_seen`, or `unknown`.
   * Pure and synchronous. `not_seen` is the host's strong evidence that the
   * act never took effect -- nothing the recorded act brought is there -- and a
   * graph run then counts the step as not done, so neither a trial's acts nor a
   * playback take it as landed (`executor/node-execution/recorded-effect.ts`).
   * Anything short of that evidence is `unknown`, which judges nothing.
   */
  routeEffectSeen?(effect: JsonObject, observed: JsonObject): AutomationStudioRouteEffectSighting;
  captureStateSnapshot?(input: AutomationStudioHostRuntimeActionContext & { point: "before_action" | "after_action" | "after_wait_retry" | "after_patch_test" }): AutomationStudioHostStateSnapshotRef | Promise<AutomationStudioHostStateSnapshotRef>;
  /**
   * What `node`'s step changed between the two snapshots, stored on the
   * attempt as `stateRefs.stateDiff` and otherwise opaque to Core. Two keys
   * Core reads when the host writes them (t598, t609), each of opaque tokens
   * in the form a permission declaration's `control.item` takes:
   *
   * - `spot`: `{ item?, dialog? }`, the item and dialog the step's control sat
   *   in on the page before it;
   * - `items`: `{ before: string[], after: string[] }`, the items the host
   *   vouches each page listed. A trial counts an item as one its step created
   *   only when it is in `after` and not in `before`, on the same document, and
   *   no earlier step of the trial showed it
   *   (`service/candidate-trial/landed-acts.ts`); a host leaves out of both
   *   sides any item it cannot vouch was absent before, such as a list only
   *   the step revealed.
   *
   * Both are page evidence: a persisted trace withholds the whole diff
   * (`executor/trace-withholding.ts`, `stateDiff`).
   */
  inspectStateDiff?(input: { before?: AutomationStudioHostStateSnapshotRef; after?: AutomationStudioHostStateSnapshotRef; node: AutomationStudioFlowNode; attemptId: string }): JsonObject | Promise<JsonObject>;
  rollbackHint?(input: AutomationStudioHostRuntimeActionContext): JsonObject | Promise<JsonObject>;
  /**
   * Decides whether an expected state holds. Bound with the rest of the host
   * runtime, so a host that binds nothing keeps Core's unconditional pass.
   */
  expectationEvaluator?(conditions: JsonValue[], mode: string, timeoutMs: number, context: AutomationNodeExpectationEvaluationContext): AutomationNodeExpectationEvaluation | Promise<AutomationNodeExpectationEvaluation>;
  /**
   * Answers a batch of fact conditions as the page stands now, with no wait,
   * one result per condition in the same order: `true`, `false` or `unknown`
   * (state-aware recovery plan, C9), offered under the capability
   * `fact-evaluation`. Core calls it once per lifecycle boundary with every
   * condition that boundary needs, and only when there is at least one. A
   * host that cannot settle a condition answers `unknown`; Core reads a
   * missing host, a throw or a batch of the wrong length as `unknown` for
   * every condition, never as `false`.
   */
  factEvaluator?(conditions: readonly AutomationStudioFactCondition[], context: AutomationStudioFactEvaluationContext): readonly AutomationStudioHostFactResult[] | Promise<readonly AutomationStudioHostFactResult[]>;
  /**
   * Whether an act whose answer was lost took effect, judged on the page from
   * the act itself (t430): asked by the effect check only for a node that
   * declares no expected state, which is every step written without a
   * `done when:`. Which of its acts can be judged this way, and how, is the
   * host's to say -- a web host reads whether the pressed control is still
   * shown -- so Core learns nothing of the medium. `landed` and `not_landed`
   * must rest on what the page showed, never on what the step declared;
   * anything else is `unknown`. It may wait up to `timeoutMs` for the page to
   * settle. Core reads a missing method, a throw or any other answer as
   * `unknown`, never as `not_landed`.
   */
  actLanded?(input: AutomationStudioHostActLandedInput): AutomationStudioHostActLanding | Promise<AutomationStudioHostActLanding>;
};

/** What the host is asked about an act whose answer was lost: the node that made it, the attempt, and how long it may wait. */
export type AutomationStudioHostActLandedInput = {
  node: AutomationStudioFlowNode;
  attemptId: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

/** The host's answer about whether a lasting step's recorded effect appeared after it answered success. */
export type AutomationStudioRouteEffectSighting = "seen" | "not_seen" | "unknown";

/** The host's answer about an act whose answer was lost: the effect check's three values. */
export type AutomationStudioHostActLanding = "landed" | "not_landed" | "unknown";

export function hostExpectationEvaluator(hostRuntime: AutomationStudioHostRuntimeBoundary | undefined): AutomationNodeExpectationEvaluator | undefined {
  const evaluate = hostRuntime?.expectationEvaluator;
  if (!evaluate) return undefined;
  return (conditions, mode, timeoutMs, context) => evaluate.call(hostRuntime, conditions, mode, timeoutMs, context);
}

export function hostRuntimeCapabilityIds(hostRuntime: AutomationStudioHostRuntimeBoundary | undefined): string[] {
  return [...new Set([...(hostRuntime?.capabilities ?? [])].map(String).filter(Boolean))].sort();
}
