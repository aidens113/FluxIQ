import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { automationStudioActivityLoopWords, automationStudioActivityStepNumbers } from "../../activity/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioLadderRungKind, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { automationStudioStopAfterNode } from "../partial-run/index.ts";
import type { AutomationStudioRunState } from "../run-state.ts";
import type { AutomationStudioParameterRefreshOverlay } from "../parameter-refresh/index.ts";
import type { automationStudioStateRouteGuard } from "../state-routing/index.ts";
import type { AutomationStudioTraceWithholding } from "../trace-withholding.ts";
import type { AutomationStudioStepLifecycleFrame } from "./lifecycle-frame.ts";

/**
 * What one graph run's step loop (`graph-run.ts`) carries from step to step,
 * handed to each seam the loop calls. It lives exactly as long as one run and
 * belongs to it: nothing here is module state, so two runs never share it.
 *
 * The arrays and maps are the run's own, mutated in place, and every trace the
 * run returns holds them by reference. `maxSteps`, `arrival` and `pendingRetry`
 * are reassigned by the seams and read by the loop on its next step; `flow` and
 * `nodesById` only by an in-run repair, which swaps the frame's graph for the
 * rest of the frame (`./incident-repair.ts`).
 */
export type AutomationStudioStepLoopContext = {
  flow: AutomationStudioFlowDocument;
  readonly options: AutomationStudioGraphExecutionOptions;
  readonly withholding: AutomationStudioTraceWithholding;
  readonly runState: AutomationStudioRunState;
  readonly now: () => number;
  readonly startedAt: number;
  readonly attempts: AutomationStudioNodeAttemptTrace[];
  readonly values: Record<string, JsonValue>;
  readonly effects: AutomationStudioGraphExecutionTrace["effects"];
  readonly regionTransitions: NonNullable<AutomationStudioGraphExecutionTrace["regionTransitions"]>;
  readonly regionStartedAt: Map<string, number>;
  readonly capabilities: ReadonlySet<string>;
  nodesById: ReadonlyMap<string, AutomationStudioFlowNode>;
  readonly stepNumbers: ReturnType<typeof automationStudioActivityStepNumbers>;
  readonly loopWords: ReturnType<typeof automationStudioActivityLoopWords>;
  /** Where state routing has sent this run, so a page that keeps sending it back to one node without progress ends it. */
  readonly routeGuard: ReturnType<typeof automationStudioStateRouteGuard>;
  /** A partial run's stop node (`partial-run/`), asked before every move out of a node. */
  readonly stopAfter: ReturnType<typeof automationStudioStopAfterNode>;
  /** The number the next attempt takes in the run, after any a re-run's first pass kept. */
  readonly nextAttemptNumber: () => number;
  /** The trace of a partial run that ended at its stop node. */
  readonly stoppedAt: (nodeId: string, message: string) => AutomationStudioGraphExecutionTrace;
  /** This frame's lifecycle dispatch bookkeeping (`./lifecycle-frame.ts`). */
  readonly lifecycle: AutomationStudioStepLifecycleFrame;
  maxSteps: number;
  /** The loop's step index now, which a handler body's steps are counted from. */
  step: number;
  /**
   * One arrival at one node: how many times it has been attempted here, which
   * ladder rungs that arrival has already spent, and which arrival at the node
   * in this frame it is (`ordinal`, 1 for the first). `reacquired` marks the
   * arrival whose stale target was already looked for again, once per arrival;
   * `overlay` is the found value laid over a bound parameter's run path for
   * this node's remaining attempts (`../target-reacquire/`, t786), gone with
   * the arrival when the run leaves the node.
   */
  arrival: {
    nodeId: string;
    attempts: number;
    consumed: Set<AutomationStudioLadderRungKind>;
    ordinal: number;
    reacquired?: true;
    overlay?: Readonly<Record<string, JsonValue>>;
    /** Target-only parameter patches for this arrival, independent of the source run-value overlay. */
    parameterOverlay?: AutomationStudioParameterRefreshOverlay;
    /** The source-less async observation needs a fresh completed-act ledger check. */
    identityReacquired?: true;
  };
  /** The retry the ladder planned, stamped on the next attempt and then cleared. */
  pendingRetry: AutomationStudioNodeAttemptTrace["retry"];
};
