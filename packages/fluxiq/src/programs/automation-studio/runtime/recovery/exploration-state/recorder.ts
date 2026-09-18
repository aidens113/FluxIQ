// The one place an exploration's steps are recorded, wrapped around the call
// that runs them.
//
// It sits exactly at `executeTool`, because that is the only moment at which
// both facts are available: the argument the action was given, which the loop
// has and then discards, and the two moments either side of the action, which
// only something wrapping the call can be between. Anything recording from
// outside would be reconstructing an order it did not witness.
//
// **A bookkeeping failure never becomes a step failure.** The digests are taken
// for the sake of a later reduction; the step itself is the recovery doing its
// job. So a digest source that throws is recorded as a failure against that
// moment and the step runs, returns and is recorded without that digest --
// which the reduction then reports as a gap rather than treating the state as
// unchanged.

import type { JsonObject } from "../../../../../core/index.ts";
import type {
  AutomationStudioExplorationStateDigestFailure,
  AutomationStudioExplorationStateDigestPhase,
  AutomationStudioExplorationStateDigestRequest,
  AutomationStudioExplorationStateDigestSource
} from "./digest-source.ts";
import type { AutomationStudioExplorationStepRecord } from "./step-record.ts";

/** The part of one action's call this recorder reads. */
export type AutomationStudioExplorationRecordedCall = {
  callId: string;
  toolId: string;
  value: JsonObject;
  signal?: AbortSignal;
};

/**
 * One exploration's step record: every action that ran, in order, with the
 * argument it was given and the state either side of it.
 *
 * Bound to one exploration and never reused across two. It holds no state of
 * its own beyond what it recorded, so a caller that binds no digest source
 * still gets the arguments -- which is the half of the record Core can always
 * supply.
 */
export class AutomationStudioExplorationStateRecorder {
  private readonly source: AutomationStudioExplorationStateDigestSource | undefined;
  private readonly recorded: AutomationStudioExplorationStepRecord[] = [];
  private readonly failures: AutomationStudioExplorationStateDigestFailure[] = [];

  constructor(input: { digestSource?: AutomationStudioExplorationStateDigestSource } = {}) {
    this.source = input.digestSource;
  }

  /** Whether the caller supplied any way of saying what the state was. */
  get observesState(): boolean {
    return this.source !== undefined;
  }

  /** The steps that ran, oldest first. */
  get steps(): readonly AutomationStudioExplorationStepRecord[] {
    return this.recorded;
  }

  /** Every moment whose digest was asked for and threw. Empty on a clean run. */
  get digestFailures(): readonly AutomationStudioExplorationStateDigestFailure[] {
    return this.failures;
  }

  /**
   * Run one action with the state digested either side of it, and record it.
   *
   * A step that throws is not recorded: nothing observed it finishing, so there
   * is no "after" and no honest row to write. The throw is the caller's to
   * handle, unchanged.
   */
  async around<T>(call: AutomationStudioExplorationRecordedCall, run: () => Promise<T>): Promise<T> {
    const stateBefore = await this.digest(call, "before");
    const result = await run();
    const stateAfter = await this.digest(call, "after");
    this.recorded.push({
      callId: call.callId,
      toolId: call.toolId,
      input: call.value,
      ...(stateBefore === undefined ? {} : { stateBefore }),
      ...(stateAfter === undefined ? {} : { stateAfter })
    });
    return result;
  }

  /**
   * Line the record up with the evidence-loop trace, by the call id both carry.
   *
   * Done once, here, rather than by every reader: the trace is what says which
   * provider turn a step belongs to, and a reader that joined the two itself
   * would be free to join them differently.
   */
  stepsAlongside(trace: ReadonlyArray<{ iteration: number; callId?: string }>): AutomationStudioExplorationStepRecord[] {
    const iterationOf = new Map<string, number>();
    for (const entry of trace) {
      if (entry.callId !== undefined && !iterationOf.has(entry.callId)) iterationOf.set(entry.callId, entry.iteration);
    }
    return this.recorded.map((record) => {
      const iteration = iterationOf.get(record.callId);
      return iteration === undefined ? record : { ...record, iteration };
    });
  }

  private async digest(call: AutomationStudioExplorationRecordedCall, phase: AutomationStudioExplorationStateDigestPhase): Promise<string | undefined> {
    const source = this.source;
    if (!source) return undefined;
    const request: AutomationStudioExplorationStateDigestRequest = {
      callId: call.callId,
      toolId: call.toolId,
      phase,
      ...(call.signal ? { signal: call.signal } : {})
    };
    let digest: string | undefined;
    try {
      digest = await source(request);
    } catch (error) {
      this.failures.push({ callId: call.callId, toolId: call.toolId, phase, reason: thrownText(error) });
    }
    return digest;
  }
}

/** What was thrown, as one bounded line. Never the state, which Core must not read. */
function thrownText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}
