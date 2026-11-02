import type { AutomationStudioExplorationBudget } from "./contract.ts";
import type { AutomationStudioExplorationStopReason } from "../outcome/stop/index.ts";
import { AutomationStudioExplorationProgressGuard, type AutomationStudioExplorationNoProgressReason } from "../progress/index.ts";
import { automationStudioRecoveryDeadlineRemainingMs, type AutomationStudioRecoveryDeadline } from "../../deadline/index.ts";
import type { AutomationStudioRunEnvironment } from "../../../environment/index.ts";

/**
 * One exploration's spending, and the signal that ends it.
 *
 * The ledger is the only thing that knows *why* the loop was stopped. The loop
 * reports `cancelled` for every abort there is, so if the reason were not
 * recorded here at the moment of the refusal, a wall clock, an action cap and a
 * refused action would all arrive downstream as the same word -- which is
 * precisely the collapse this phase exists to prevent.
 */
export class AutomationStudioExplorationBudgetLedger {
  private readonly controller = new AbortController();
  private readonly budget: AutomationStudioExplorationBudget;
  private readonly now: () => number;
  private readonly expiresAtMs: number;
  private readonly expiryReason: AutomationStudioExplorationStopReason;
  private readonly attempts = new Map<string, number>();
  private readonly progress: AutomationStudioExplorationProgressGuard;
  private readonly startTimer: AutomationStudioRunEnvironment["startTimer"];
  private readonly externalSignal: AbortSignal | undefined;
  private readonly externalAbort: () => void;
  private cancelTimer: (() => void) | undefined;
  private readonly cleanupErrors: unknown[] = [];
  private closed = false;
  private listening = false;
  private stopped: AutomationStudioExplorationStopReason | undefined;
  private actionCount = 0;
  private refusedCount = 0;
  private observedCount = 0;
  private providerCallCount = 0;

  constructor(input: {
    budget: AutomationStudioExplorationBudget;
    startedAtMs: number;
    now?: AutomationStudioRunEnvironment["now"];
    startTimer?: AutomationStudioRunEnvironment["startTimer"];
    recoveryDeadline?: AutomationStudioRecoveryDeadline;
    externalSignal?: AbortSignal;
  }) {
    this.budget = input.budget;
    this.progress = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: input.budget.maxStepsWithoutProgress });
    this.now = input.now ?? (() => Date.now());
    const startTimer = input.startTimer;
    this.startTimer = startTimer ? (wait, delayMs, fire) => startTimer.call(input, wait, delayMs, fire) : undefined;
    this.externalSignal = input.externalSignal;
    this.externalAbort = () => {
      try {
        this.close();
      } catch (error) {
        // Abort listeners cannot return a failure to their owner. Retain it
        // for the owner's final close instead of losing the cleanup failure.
        this.cleanupErrors.push(error);
      } finally {
        this.controller.abort();
      }
    };
    const ownExpiry = input.startedAtMs + input.budget.maxDurationMs;
    const recoveryExpiry = input.recoveryDeadline
      ? input.startedAtMs + automationStudioRecoveryDeadlineRemainingMs(input.recoveryDeadline, input.startedAtMs)
      : Number.POSITIVE_INFINITY;
    // The smaller clock wins, and which one it was is kept: "this exploration
    // needs longer" and "the recovery as a whole needs longer" are different
    // pieces of advice and must not arrive as one.
    this.expiresAtMs = Math.min(ownExpiry, recoveryExpiry);
    this.expiryReason = recoveryExpiry <= ownExpiry ? "recovery_deadline_expired" : "wall_clock_expired";
    try {
      if (this.externalSignal?.aborted) {
        this.closed = true;
        this.controller.abort();
      } else {
        this.listening = this.externalSignal !== undefined;
        this.externalSignal?.addEventListener("abort", this.externalAbort, { once: true });
        this.arm();
      }
    } catch (error) {
      try {
        this.close();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Exploration timer construction and cleanup failed.");
      }
      throw error;
    }
  }

  /** Passed to the evidence loop, so an expiry unwinds it at the next check. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Why the budget ended it, or absent when the budget did not. */
  get stopReason(): AutomationStudioExplorationStopReason | undefined {
    return this.stopped;
  }

  /** Every action admitted, refused ones included. */
  get actions(): number {
    return this.actionCount;
  }

  /** Actions that returned evidence rather than a refusal. The only input to success. */
  get observedActions(): number {
    return this.observedCount;
  }

  get refusedActions(): number {
    return this.refusedCount;
  }

  get providerCalls(): number {
    return this.providerCallCount;
  }

  /** Why the exploration stopped advancing, when it did. Absent otherwise. */
  get noProgressReason(): AutomationStudioExplorationNoProgressReason | undefined {
    return this.stopped === "no_progress" ? this.progress.reason : undefined;
  }

  /** Steps in a row that produced nothing new. Zero while the loop is learning. */
  get stepsWithoutProgress(): number {
    return this.progress.stepsWithoutProgress;
  }

  remainingMs(): number {
    return Number.isFinite(this.expiresAtMs) ? Math.max(0, this.expiresAtMs - this.now()) : Number.POSITIVE_INFINITY;
  }

  /** Charge one provider decision, before it is made. */
  admitProviderCall(): { admitted: true } | { admitted: false; stopReason: AutomationStudioExplorationStopReason } {
    const expired = this.checkClock();
    if (expired) return expired;
    if (this.providerCallCount >= this.budget.maxProviderCalls) return this.stop("provider_call_limit");
    this.providerCallCount += 1;
    return { admitted: true };
  }

  /** Charge one action, before it runs. `signature` identifies what it is doing. */
  admitAction(signature: string): { admitted: true } | { admitted: false; stopReason: AutomationStudioExplorationStopReason } {
    const expired = this.checkClock();
    if (expired) return expired;
    if (this.actionCount >= this.budget.maxActions) return this.stop("action_limit");
    const attempts = (this.attempts.get(signature) ?? 0) + 1;
    if (attempts > this.budget.maxRepeatsPerAction) return this.stop("repeat_window");
    this.attempts.set(signature, attempts);
    this.actionCount += 1;
    return { admitted: true };
  }

  /**
   * Record what an admitted action produced.
   *
   * `refused` is the domain's own refusal translated into Core's vocabulary.
   * A refusal is feedback the first time -- the model is meant to try something
   * else -- and a wall once the allowance is spent, so this is what turns "it
   * kept being told no" into `unsafe_action_blocked` rather than into an
   * exploration that quietly found nothing.
   */
  recordAction(input: {
    /** The action's identity, as `admitAction` was given it. */
    signature: string;
    /** A digest of what came back, so a held answer is recognised by content. */
    evidenceDigest: string;
    /** Bytes the action actually carried. Zero is not an answer. */
    evidenceBytes: number;
    refused?: AutomationStudioExplorationStopReason;
  }): void {
    if (input.refused) {
      this.refusedCount += 1;
      // The refusal allowance is charged before the progress streak on purpose.
      // Both can come due on the same action, and "every action left was
      // refused" is the more specific thing to report: it names what to change
      // about the exploration's scope, where the streak only says it stopped
      // learning. First reason wins inside `stop`, so the order here is the
      // decision.
      if (this.refusedCount >= this.budget.maxRefusedActions) this.stop(input.refused);
    } else {
      this.observedCount += 1;
    }
    const verdict = this.progress.record({
      signature: input.signature,
      evidenceDigest: input.evidenceDigest,
      evidenceBytes: input.evidenceBytes,
      refused: input.refused !== undefined
    });
    if (!verdict.advanced && verdict.stalled) this.stop("no_progress");
  }

  /**
   * Record a provider decision that was made and could not be used.
   *
   * It has already been charged by `admitProviderCall`. What it adds is a step
   * that did not advance, so a loop whose every answer is unusable stops on the
   * progress guard -- saying so -- rather than on the provider-call backstop.
   */
  recordUnusableDecision(): void {
    if (this.progress.recordUnusableDecision().stalled) this.stop("no_progress");
  }

  /** Release the timer. Safe to call more than once. */
  close(): void {
    this.closed = true;
    const errors = this.cleanupErrors.splice(0);
    try {
      if (this.listening) {
        this.listening = false;
        this.externalSignal?.removeEventListener("abort", this.externalAbort);
      }
    } catch (error) {
      errors.push(error);
    }
    const cancel = this.cancelTimer;
    this.cancelTimer = undefined;
    try {
      cancel?.();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Exploration timer cleanup failed.");
  }

  private arm(): void {
    if (this.closed || !Number.isFinite(this.expiresAtMs)) return;
    const remaining = this.remainingMs();
    if (remaining <= 0) {
      this.stop(this.expiryReason);
      return;
    }
    // A clock that runs out mid-call aborts it as a timeout. The provider call
    // it cuts off was spent, not cancelled, and the patch call that follows
    // must not read it as a cancellation and end with it.
    const expire = () => {
      try {
        this.stop(this.expiryReason, new DOMException("The exploration ran out of time.", "TimeoutError"));
      } catch (error) {
        // Timer callbacks have no caller to reject. The owner observes this
        // retained failure when it closes after the aborted exploration.
        this.cleanupErrors.push(error);
      }
    };
    if (this.startTimer) {
      const timer = this.startTimer({ kind: "exploration_timeout" }, remaining, expire);
      const cancel = timer.cancel;
      this.cancelTimer = () => cancel.call(timer);
    } else {
      const timer = setTimeout(expire, remaining);
      this.cancelTimer = () => clearTimeout(timer);
      // A recovery must never hold the process open past its own work.
      timer.unref?.();
    }
    // A custom timer may fire before returning its original handle.
    if (this.closed) this.close();
  }

  private checkClock(): { admitted: false; stopReason: AutomationStudioExplorationStopReason } | undefined {
    if (this.stopped) return { admitted: false, stopReason: this.stopped };
    if (this.remainingMs() > 0) return undefined;
    return this.stop(this.expiryReason);
  }

  private stop(reason: AutomationStudioExplorationStopReason, abortReason?: DOMException): { admitted: false; stopReason: AutomationStudioExplorationStopReason } {
    // First reason wins. A later abort cannot overwrite what actually stopped it.
    this.stopped ??= reason;
    try {
      this.close();
    } finally {
      this.controller.abort(abortReason);
    }
    return { admitted: false, stopReason: this.stopped };
  }
}
