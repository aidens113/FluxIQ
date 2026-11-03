// What retrying has added to a run, so the per-run ceiling is enforced rather
// than merely stated.
//
// **Why this keeps its own state instead of joining the run budget.** The run's
// budget ledger counts calls, tokens and money, and a retry deliberately costs
// none of the three: one question asked of the model is one call, and a refused
// attempt returns no usage to charge. What a retry does cost is wall clock, and
// a bound on wall clock has to be able to see every call in the run -- otherwise
// each call is bounded at a minute and forty-eight of them are bounded at
// nothing, which is the arithmetic that turns a defence into a hang.
//
// **Why a process-wide default exists.** A mechanism nobody writes to is worse
// than an absent one: this runtime already carries three recovery rungs that
// read metadata no code writes, and they read as done while doing nothing. A
// per-run allowance that only worked when a caller threaded a ledger through
// would be the fourth. So the harness writes to Core's own by default, and a
// caller -- a test, or a host running several runs it wants accounted separately
// -- may pass its own.
//
// Entries are bounded and evicted least-recently-used. Eviction loosens rather
// than tightens: a run whose entry is gone may retry again, which is the safe
// direction for a cache that exists to stop a hang, not to enforce a quota.
import { AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS } from "./limits.ts";

export class AutomationStudioLlmProviderRetryLedger {
  private readonly runs = new Map<string, number>();

  /** The wall clock retrying has added to this run: every wait, and every attempt after a call's first. */
  addedMs(runId: string): number {
    return this.runs.get(runId) ?? 0;
  }

  /** Charge the run. Called with a wait before it is taken, and with a retried attempt's own duration once it is known. */
  spend(runId: string, milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    const spent = (this.runs.get(runId) ?? 0) + Math.round(milliseconds);
    // Delete before setting so the map's insertion order is a recency order and
    // the entry evicted below is the one no live run is using.
    this.runs.delete(runId);
    this.runs.set(runId, spent);
    while (this.runs.size > AUTOMATION_STUDIO_LLM_PROVIDER_RETRY_LIMITS.ledgerRuns) {
      const oldest = this.runs.keys().next();
      if (oldest.done) return;
      this.runs.delete(oldest.value);
    }
  }
}

/** Core's own, used by every call whose caller names no other. */
export const automationStudioLlmProviderRetryRunLedger = new AutomationStudioLlmProviderRetryLedger();
