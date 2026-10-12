// A node's pace in one run: the least time between two successive starts of it.
//
// The user's rule (t378): when a trial meets a site's "you're going too fast"
// notice, the Flow must slow down, not only wait the notice out once. Lane D
// (`run-mv0fuual-f9e6f089`) showed nothing did: the page allowed three
// confirms per fifteen seconds, the run waited out the 4th press's refusal and
// pressed again, and walked straight into the 7th's, because no pass carried
// anything over from the one before.
//
// So a pace has two sources. A node may carry one (`metadata.paceMs`,
// `./pace-metadata.ts`). And a failure that carries a wait hint -- the
// producer's `retryAfterMs`, a transport's Retry-After, whatever the fault
// assessment read into `hintedWaitMs` -- raises the node's pace for the rest of
// the run to at least that hint, and each further hinted failure grows it by
// half again, up to `AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS`. Nothing here reads
// a domain's code: a hint is a hint, from whichever producer.
//
// The pace holds a node's *arrivals*, not the retries of one arrival: those
// wait under the defensive policy's own bound, which already honours the hint
// (`../graph-run.ts`), and pacing them too would wait the same hint twice.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace, AutomationStudioNodePace } from "../contracts.ts";
import { automationStudioAuthoredPaceMs } from "./pace-metadata.ts";

/**
 * The longest pace a run learns from hints. It matches the longest hint the
 * runtime takes (`AUTOMATION_STUDIO_MAX_RETRY_HINT_MS`): a site that wants a
 * minute between presses is asking for something a pace can still give, and one
 * that wants more is not slowed further by the run on its own. An authored pace
 * is the author's, and is never cut to this.
 */
export const AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS = 60_000;

/** How much a further hinted failure grows a pace that was already in force. */
const GROWTH = 1.5;

type NodePaceState = { authoredMs?: number; paceMs: number; raisedCount: number; waitedMs: number; lastStartAt?: number };

/** The run's paces, one entry per node it met. */
export type AutomationStudioPaceKeeper = {
  /** Holds the node until its pace allows another start, and says what that cost; nothing when the node has no pace. */
  before(node: AutomationStudioFlowNode, now: () => number, wait: (ms: number) => Promise<void>): Promise<NonNullable<AutomationStudioNodeAttemptTrace["pace"]> | undefined>;
  /** Notes that the node was dispatched at `at`. */
  started(node: AutomationStudioFlowNode, at: number): void;
  /** Raises the node's pace after a failure that asked for `hintMs`; answers the pace now in force when it rose. */
  learn(node: AutomationStudioFlowNode, hintMs: number): number | undefined;
  /** Every node held to a pace, for the trace; nothing when none was. */
  summary(): AutomationStudioNodePace[] | undefined;
};

export function automationStudioPaceKeeper(): AutomationStudioPaceKeeper {
  const nodes = new Map<string, NodePaceState>();
  const stateOf = (node: AutomationStudioFlowNode): NodePaceState => {
    let state = nodes.get(node.id);
    if (!state) {
      const authoredMs = automationStudioAuthoredPaceMs(node);
      state = { ...(authoredMs === undefined ? {} : { authoredMs }), paceMs: authoredMs ?? 0, raisedCount: 0, waitedMs: 0 };
      nodes.set(node.id, state);
    }
    return state;
  };
  return {
    async before(node, now, wait) {
      const state = stateOf(node);
      if (!state.paceMs) return undefined;
      const dueMs = state.lastStartAt === undefined ? 0 : Math.max(0, Math.round(state.lastStartAt + state.paceMs - now()));
      if (dueMs > 0) {
        await wait(dueMs);
        state.waitedMs += dueMs;
      }
      return { inForceMs: state.paceMs, waitedMs: dueMs };
    },
    started(node, at) {
      stateOf(node).lastStartAt = at;
    },
    learn(node, hintMs) {
      if (!(Number.isFinite(hintMs) && hintMs > 0)) return undefined;
      const state = stateOf(node);
      // A pace already in force was not enough, so it grows; a hint is the floor either way.
      const grown = Math.ceil(state.paceMs * GROWTH);
      const next = Math.max(state.authoredMs ?? 0, Math.min(AUTOMATION_STUDIO_MAX_LEARNED_PACE_MS, Math.max(Math.round(hintMs), grown)));
      if (next <= state.paceMs) return undefined;
      state.paceMs = next;
      state.raisedCount += 1;
      return next;
    },
    summary() {
      const paced = [...nodes].filter(([, state]) => state.paceMs > 0).map(([nodeId, state]): AutomationStudioNodePace => ({
        nodeId,
        paceMs: state.paceMs,
        ...(state.authoredMs === undefined ? {} : { authoredMs: state.authoredMs }),
        ...(state.raisedCount > 0 ? { learnedMs: state.paceMs } : {}),
        raisedCount: state.raisedCount,
        waitedMs: state.waitedMs
      }));
      return paced.length ? paced : undefined;
    }
  };
}
