// What one exploration is allowed to spend, and the ledger that keeps its record.
//
// The bounds already in Core are real but they are the wrong shape for this:
// the evidence loop counts tool calls and iterations, the run budget counts
// provider calls and tokens, and a provider call is capped at 45 seconds. None
// of them is a clock over the exploration as a whole, and none of them can
// refuse an action for being out of scope, because scope is a thing only a
// domain understands.
//
// So this **composes** those bounds rather than restating them. The run's purse
// -- its money, its tokens and any call count a person or a resolver declared --
// pays for every decision (`annotation/exploration.ts`), and when it cannot pay
// for the next one the exploration ends `budget_exhausted` on the purse's own
// code. The ledger adds the clock and the record. There is no evidence-bytes
// stop here: what an exploration looks at is shown to the model whole
// (2026-09-30), and the run's cost is what bounds how much looking it can afford.
//
// **A wall clock.** One `AbortController`, armed at the smaller of this
// exploration's own limit and whatever is left of the whole recovery, and the
// ledger records which of the two it was. The loop takes the signal, so an
// expiry unwinds it at the next iteration instead of after the current provider
// call finally answers.
//
// **No count ends an exploration (t1049, t1057).** There were five: three steps
// in a row that learned nothing (t1049 removed it), and until t1057 an allowance
// of twenty-four actions, one of twenty-four provider calls, the third attempt
// of one identical action and the second refused action. Each ended the
// exploration however much it was still learning, against the user's rule
// (2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY
// JUST RESETS EVERYTHING"). Now a repeat is loop detection's to catch -- a cycle
// of reveal, navigate, reveal, navigate is a `cycle` there, and the same lasting
// act on one target is refused there from its third landing -- and the model's
// own loop decision follows; a refusal is shown to the model as the action's
// result, with its code and reason. Only the answer, the purse, the clock or a
// person ends an exploration.
//
// **The record stays.** Every action admitted, how often each identical one
// was attempted, every refusal and its kind, every provider decision: the
// exploration's receipt and the trace say them, as evidence of what was tried.
// None of them is a stop.
//
// **Destructive off, as a type rather than a flag.** `allowDestructive` is
// typed `false`. There is no value a caller can pass to turn it on, no
// configuration that can be got wrong, and no default that can drift, which is
// the only form of "off by default" that survives contact with a new call site.
// The registry independently never offers a destructive option; this is the
// second of the two, and decision L3 puts the semantic test itself in the
// domain, because what counts as destructive is a statement about meaning.
//
// **A scope policy Core carries and the domain enforces.** The scopes are
// opaque strings. Core knows that an exploration may stay where it started or
// move only to a named place; it does not know that the web's version of that
// is an origin, and must not.

import type { AutomationStudioExplorationRefusal, AutomationStudioExplorationStopReason } from "./exploration-outcome.ts";
import {
  AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS,
  automationStudioRecoveryDeadlineRemainingMs,
  type AutomationStudioRecoveryDeadline
} from "./recovery-deadline.ts";

/**
 * Where an exploration may go.
 *
 * `same_scope` keeps it where the run already is. `allowlist` names the places
 * it may also reach. Both sides are opaque to Core: the domain supplies the
 * strings and calls `automationStudioExplorationScopeAllows` to compare them,
 * so a domain with no pages and no origins expresses its own idea of "where"
 * in exactly this policy.
 */
export type AutomationStudioExplorationScopePolicy =
  | { kind: "same_scope" }
  | { kind: "allowlist"; scopes: readonly string[] };

export type AutomationStudioExplorationBudget = {
  schemaVersion: "automation-studio.exploration-budget.v1";
  /** The wall clock for this one exploration. The whole recovery has its own. */
  maxDurationMs: number;
  /** Not a switch. There is no value that turns destructive actions on. */
  allowDestructive: false;
  scopePolicy: AutomationStudioExplorationScopePolicy;
};

export const AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS: AutomationStudioExplorationBudget = Object.freeze({
  schemaVersion: "automation-studio.exploration-budget.v1",
  // The clock is the recovery deadline's own default, read rather than copied,
  // so raising the recovery's limit raises this with it rather than leaving a
  // shorter cap underneath it.
  maxDurationMs: AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS,
  allowDestructive: false,
  scopePolicy: Object.freeze({ kind: "same_scope" })
});

/** The most a host may ask for. */
export const AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS = Object.freeze({
  maxDurationMs: 600_000
});

/**
 * A budget from whatever a caller asked for, clamped into range.
 *
 * Clamped rather than refused, and the direction is always downwards. A
 * recovery is already a failure being handled, so throwing over a badly
 * configured number would replace a bounded exploration with none at all; and
 * clamping upwards would let a caller widen a ceiling by asking for nonsense.
 */
export function resolveAutomationStudioExplorationBudget(input?: Partial<Omit<AutomationStudioExplorationBudget, "schemaVersion" | "allowDestructive">>): AutomationStudioExplorationBudget {
  const defaults = AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS;
  return {
    schemaVersion: "automation-studio.exploration-budget.v1",
    maxDurationMs: clamp(input?.maxDurationMs, defaults.maxDurationMs, 1, AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS.maxDurationMs),
    allowDestructive: false,
    scopePolicy: scopePolicy(input?.scopePolicy) ?? defaults.scopePolicy
  };
}

/**
 * Whether the policy lets this exploration reach that scope.
 *
 * Fails closed in both directions that matter: an unknown current scope under
 * `same_scope` refuses, because "we do not know where we are" is not a licence
 * to go anywhere, and an empty allowlist refuses everything rather than
 * everything-because-nothing-was-listed. Both are the silent-no-protection
 * shape this plan keeps finding.
 */
export function automationStudioExplorationScopeAllows(
  policy: AutomationStudioExplorationScopePolicy,
  input: { currentScope?: string; requestedScope: string }
): boolean {
  if (typeof input.requestedScope !== "string" || !input.requestedScope.length) return false;
  if (policy.kind === "allowlist") return policy.scopes.includes(input.requestedScope);
  return typeof input.currentScope === "string" && input.currentScope.length > 0 && input.currentScope === input.requestedScope;
}

/**
 * One exploration's record, and the clock that ends it.
 *
 * The ledger is the only thing that knows *why* its clock stopped the loop. The
 * loop reports `cancelled` for every abort there is, so if the reason were not
 * recorded here at the moment it fired, this exploration's clock and the
 * recovery's would arrive downstream as the same word.
 */
export class AutomationStudioExplorationBudgetLedger {
  private readonly controller = new AbortController();
  private readonly now: () => number;
  private readonly expiresAtMs: number;
  private readonly expiryReason: AutomationStudioExplorationStopReason;
  private readonly attempts = new Map<string, number>();
  private readonly refusalKinds = new Map<AutomationStudioExplorationRefusal, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped: AutomationStudioExplorationStopReason | undefined;
  private actionCount = 0;
  private refusedCount = 0;
  private observedCount = 0;
  private providerCallCount = 0;

  constructor(input: {
    budget: AutomationStudioExplorationBudget;
    startedAtMs: number;
    now?: () => number;
    recoveryDeadline?: AutomationStudioRecoveryDeadline;
    externalSignal?: AbortSignal;
  }) {
    this.now = input.now ?? (() => Date.now());
    const ownExpiry = input.startedAtMs + input.budget.maxDurationMs;
    const recoveryExpiry = input.recoveryDeadline
      ? input.startedAtMs + automationStudioRecoveryDeadlineRemainingMs(input.recoveryDeadline, input.startedAtMs)
      : Number.POSITIVE_INFINITY;
    // The smaller clock wins, and which one it was is kept: "this exploration
    // needs longer" and "the recovery as a whole needs longer" are different
    // pieces of advice and must not arrive as one.
    this.expiresAtMs = Math.min(ownExpiry, recoveryExpiry);
    this.expiryReason = recoveryExpiry <= ownExpiry ? "recovery_deadline_expired" : "wall_clock_expired";
    input.externalSignal?.addEventListener("abort", () => this.controller.abort(), { once: true });
    if (input.externalSignal?.aborted) this.controller.abort();
    this.arm();
  }

  /** Passed to the evidence loop, so an expiry unwinds it at the next check. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Which clock ended it, or absent when no clock did. */
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

  /** Refused actions by the kind of refusal they met. Evidence, never a stop. */
  get refusals(): Readonly<Partial<Record<AutomationStudioExplorationRefusal, number>>> {
    return Object.fromEntries(this.refusalKinds);
  }

  /** Admitted actions that were another attempt of an identical earlier one, mutations notwithstanding. Evidence, never a stop. */
  get repeatedActions(): number {
    let repeated = 0;
    for (const attempts of this.attempts.values()) repeated += attempts - 1;
    return repeated;
  }

  get providerCalls(): number {
    return this.providerCallCount;
  }

  remainingMs(): number {
    return Number.isFinite(this.expiresAtMs) ? Math.max(0, this.expiresAtMs - this.now()) : Number.POSITIVE_INFINITY;
  }

  /** Record one provider decision, before it is made. Refused only when a clock has run out. */
  admitProviderCall(): { admitted: true } | { admitted: false; stopReason: AutomationStudioExplorationStopReason } {
    const expired = this.checkClock();
    if (expired) return expired;
    this.providerCallCount += 1;
    return { admitted: true };
  }

  /**
   * Record one action, before it runs. `signature` identifies what it is doing,
   * so how often one identical action was attempted is kept. Refused only when a
   * clock has run out: an action attempted again is loop detection's to steer.
   */
  admitAction(signature: string): { admitted: true } | { admitted: false; stopReason: AutomationStudioExplorationStopReason } {
    const expired = this.checkClock();
    if (expired) return expired;
    this.attempts.set(signature, (this.attempts.get(signature) ?? 0) + 1);
    this.actionCount += 1;
    return { admitted: true };
  }

  /**
   * Record what an admitted action produced.
   *
   * `refused` is the domain's own refusal translated into Core's vocabulary, or
   * a person's no. A refusal is feedback, every time: the model is shown it as
   * the action's result and tries something else, and the loop's own refusal
   * handling steers a run of them (t1057; the second refusal ended the
   * exploration `unsafe_action_blocked` until then).
   */
  recordAction(input: { refused?: AutomationStudioExplorationRefusal }): void {
    if (input.refused) {
      this.refusedCount += 1;
      this.refusalKinds.set(input.refused, (this.refusalKinds.get(input.refused) ?? 0) + 1);
    } else {
      this.observedCount += 1;
    }
  }

  /** Release the timer. Safe to call more than once. */
  close(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private arm(): void {
    if (!Number.isFinite(this.expiresAtMs)) return;
    const remaining = this.remainingMs();
    if (remaining <= 0) {
      this.stop(this.expiryReason);
      return;
    }
    // A clock that runs out mid-call aborts it as a timeout. The provider call
    // it cuts off was spent, not cancelled, and the patch call that follows
    // must not read it as a cancellation and end with it.
    this.timer = setTimeout(() => this.stop(this.expiryReason, new DOMException("The exploration ran out of time.", "TimeoutError")), remaining);
    // A recovery must never hold the process open past its own work.
    this.timer.unref?.();
  }

  private checkClock(): { admitted: false; stopReason: AutomationStudioExplorationStopReason } | undefined {
    if (this.stopped) return { admitted: false, stopReason: this.stopped };
    if (this.remainingMs() > 0) return undefined;
    return this.stop(this.expiryReason);
  }

  private stop(reason: AutomationStudioExplorationStopReason, abortReason?: DOMException): { admitted: false; stopReason: AutomationStudioExplorationStopReason } {
    // First reason wins. A later abort cannot overwrite what actually stopped it.
    this.stopped ??= reason;
    this.close();
    this.controller.abort(abortReason);
    return { admitted: false, stopReason: this.stopped };
  }
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function scopePolicy(value: AutomationStudioExplorationScopePolicy | undefined): AutomationStudioExplorationScopePolicy | undefined {
  if (!value) return undefined;
  if (value.kind === "same_scope") return { kind: "same_scope" };
  if (value.kind !== "allowlist" || !Array.isArray(value.scopes)) return undefined;
  const scopes = value.scopes.filter((scope): scope is string => typeof scope === "string" && scope.length > 0 && scope.length <= 2_000).slice(0, 50);
  return { kind: "allowlist", scopes };
}
