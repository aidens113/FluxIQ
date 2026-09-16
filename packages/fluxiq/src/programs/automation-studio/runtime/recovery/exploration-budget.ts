// What one exploration is allowed to spend, and the ledger that spends it.
//
// The bounds already in Core are real but they are the wrong shape for this:
// the evidence loop counts tool calls and iterations, the run budget counts
// provider calls and tokens, and a provider call is capped at 45 seconds. None
// of them is a clock over the exploration as a whole, none of them can say "you
// have tried that already", and none of them can refuse an action for being out
// of scope, because scope is a thing only a domain understands.
//
// So this **composes** those bounds rather than restating them. The loop keeps
// its own ceiling on evidence bytes and its own duplicate and no-progress
// checks; the ledger adds the five things it cannot see.
//
// **A wall clock.** One `AbortController`, armed at the smaller of this
// exploration's own limit and whatever is left of the whole recovery, and the
// ledger records which of the two it was. The loop takes the signal, so an
// expiry unwinds it at the next iteration instead of after the current provider
// call finally answers.
//
// **An action count the ledger owns.** The loop's `maxToolCalls` is left at
// Core's ceiling and the ledger is the binding limit, so the cap is enforced
// where it can be reported precisely. A refused action still counts: an
// exploration that spends its whole allowance being told no has spent it, and
// counting only the successes is how a budget stops bounding anything. The
// count is a runaway backstop, not the working limit -- an exploration that is
// still learning something is meant to reach the end of the recovery's clock or
// the run's tokens, not to be cut off at a small number of turns.
//
// **A progress guard.** The one bound here that is not a quantity. Cost, tokens
// and the clock all answer "may it spend more"; `progress-guard.ts` answers
// "did the last few steps do anything", and it is what makes the counts above
// safe to set out of the way. The ledger owns the verdict because the ledger is
// the only thing that records why an exploration stopped.
//
// **A repeat limit across mutations.** The loop refuses the identical request
// twice within one mutation epoch, and refuses re-observing without a mutation
// between. What it cannot see is a cycle: reveal, navigate, reveal, navigate,
// each one legal because something changed in between. The ledger counts an
// action's identity for the whole exploration, so a cycle ends at the third
// turn of the wheel rather than at the sixteenth tool call.
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

import type { AutomationStudioExplorationStopReason } from "./exploration-outcome.ts";
import {
  AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS,
  AutomationStudioExplorationProgressGuard,
  type AutomationStudioExplorationNoProgressReason
} from "./progress-guard.ts";
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
  /** Every action attempted, refused ones included. */
  maxActions: number;
  /** Provider decisions. The loop's iteration ceiling is the backstop above it. */
  maxProviderCalls: number;
  /** Handed to the loop, which owns enforcing it. */
  maxEvidenceBytes: number;
  /** How many refusals before the exploration is treated as blocked rather than adjusting. */
  maxRefusedActions: number;
  /** How many times one identical action may be attempted, mutations notwithstanding. */
  maxRepeatsPerAction: number;
  /** Consecutive steps that may fail to advance before the loop is stopped. */
  maxStepsWithoutProgress: number;
  /** Not a switch. There is no value that turns destructive actions on. */
  allowDestructive: false;
  scopePolicy: AutomationStudioExplorationScopePolicy;
};

export const AUTOMATION_STUDIO_EXPLORATION_BUDGET_DEFAULTS: AutomationStudioExplorationBudget = Object.freeze({
  schemaVersion: "automation-studio.exploration-budget.v1",
  // Time, actions and provider calls are runaway backstops. They are set where
  // a loop that is still getting somewhere will not meet them: the recovery's
  // own clock, the run's token pot and the progress guard are what a healthy
  // exploration actually ends on. The clock is the recovery deadline's own
  // default, read rather than copied, so raising the recovery's limit raises
  // this with it rather than leaving a shorter cap underneath it.
  maxDurationMs: AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS,
  maxActions: 24,
  maxProviderCalls: 24,
  maxEvidenceBytes: 262_144,
  maxRefusedActions: 2,
  maxRepeatsPerAction: 2,
  maxStepsWithoutProgress: AUTOMATION_STUDIO_EXPLORATION_DEFAULT_MAX_STEPS_WITHOUT_PROGRESS,
  allowDestructive: false,
  scopePolicy: Object.freeze({ kind: "same_scope" })
});

/**
 * The most a host may ask for. The three that bound the loop are Core's own
 * loop ceilings, not a preference of this file's.
 *
 * They are written out rather than read from `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS`
 * because `llm/harness/intervention.ts` imports a *value* from this directory,
 * so reading one back at module-evaluation time closes a cycle and leaves this
 * constant holding `undefined` -- observed, not theorised. A test pins the three
 * equal to the loop's own limits, so they cannot drift apart silently.
 */
export const AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS = Object.freeze({
  maxDurationMs: 600_000,
  maxActions: 64,
  maxProviderCalls: 64,
  maxEvidenceBytes: 1_048_576,
  maxRefusedActions: 8,
  maxRepeatsPerAction: 4,
  maxStepsWithoutProgress: 8
});

const MIN_EVIDENCE_BYTES = 4_096;

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
  const ceilings = AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS;
  return {
    schemaVersion: "automation-studio.exploration-budget.v1",
    maxDurationMs: clamp(input?.maxDurationMs, defaults.maxDurationMs, 1, ceilings.maxDurationMs),
    maxActions: clamp(input?.maxActions, defaults.maxActions, 1, ceilings.maxActions),
    maxProviderCalls: clamp(input?.maxProviderCalls, defaults.maxProviderCalls, 1, ceilings.maxProviderCalls),
    maxEvidenceBytes: clamp(input?.maxEvidenceBytes, defaults.maxEvidenceBytes, MIN_EVIDENCE_BYTES, ceilings.maxEvidenceBytes),
    maxRefusedActions: clamp(input?.maxRefusedActions, defaults.maxRefusedActions, 1, ceilings.maxRefusedActions),
    maxRepeatsPerAction: clamp(input?.maxRepeatsPerAction, defaults.maxRepeatsPerAction, 1, ceilings.maxRepeatsPerAction),
    maxStepsWithoutProgress: clamp(input?.maxStepsWithoutProgress, defaults.maxStepsWithoutProgress, 1, ceilings.maxStepsWithoutProgress),
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
    this.budget = input.budget;
    this.progress = new AutomationStudioExplorationProgressGuard({ maxStepsWithoutProgress: input.budget.maxStepsWithoutProgress });
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
    this.timer = setTimeout(() => this.stop(this.expiryReason), remaining);
    // A recovery must never hold the process open past its own work.
    this.timer.unref?.();
  }

  private checkClock(): { admitted: false; stopReason: AutomationStudioExplorationStopReason } | undefined {
    if (this.stopped) return { admitted: false, stopReason: this.stopped };
    if (this.remainingMs() > 0) return undefined;
    return this.stop(this.expiryReason);
  }

  private stop(reason: AutomationStudioExplorationStopReason): { admitted: false; stopReason: AutomationStudioExplorationStopReason } {
    // First reason wins. A later abort cannot overwrite what actually stopped it.
    this.stopped ??= reason;
    this.close();
    this.controller.abort();
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
