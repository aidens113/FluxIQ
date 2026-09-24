// The standing authorization that lets a run nobody is watching obtain a model
// to judge its own result.
//
// Why this exists at all. Every provider call in Core needs a person's grant,
// and `AutomationStudioLlmExecutionGrantService.issue` refuses without a live
// actor session: "LLM execution actor session is unavailable." A Flow replayed
// on a schedule at three in the morning has no such session, so as the code
// stood its result could never be judged -- and checking runs nobody is
// watching is the entire point of the schedule beside this.
//
// The user settled the shape directly, on being shown the recommendation:
// "Yes this is how it should be. If a user says do this to acheive automation,
// it should do that." So the person turning result checking on *is* the
// authorization. It is not a prompt per occurrence, which would defeat the
// feature; it is a standing permission with three bounds that a per-occurrence
// prompt would not give you anyway:
//
//   * a redemption scope of exactly one task kind, `loop_verification`, which
//     is one question about a finished run and cannot diagnose, gather, patch
//     or propose;
//   * a cost ceiling, which is what stops a Flow that refutes on every check
//     spending without a limit the person set;
//   * an expiry, after which checking stops until the person renews it.
//
// It is deliberately NOT a loosening of the grant service. A grant purpose that
// could be issued without a session would let unattended work reach
// `explore_and_adapt` and the Flow-building kinds as well.
//
// **The repair clause.** That paragraph used to end "and the repair a
// refutation triggers is a separate authorization question with a separate
// answer". It is still a separate question; it now has an answer, and the
// answer is a clause on this same record rather than a second instrument. The
// user settled it in the same words as the first: "If a user says do this to
// acheive automation, it should do that." An instruction to automate something
// carries authority for the bounded, non-destructive means of achieving it,
// and a run that cannot obtain a model to *produce* a repair cannot repair
// itself at all -- measured on 2026-09-23 as a failed unattended run reaching
// `llm.provider_missing` with no diagnosis, no patch and no retry, while the
// gate after it was already working.
//
// One record, because the person gave one permission, and because two purses
// over one Flow would disagree about what it had spent. A repair therefore
// draws on the **same** `maxTotalCostUsd` and stops at the **same**
// `expiresAtMs`; what the clause adds is its own on switch and its own
// per-repair ceiling. `repair.ts` is as unparameterised about its task kinds
// as `redeem.ts` is about `loop_verification`: neither takes the kinds as an
// argument, so no settings field and no caller can widen either.

/** The one task kind a standing check authorization can ever be redeemed for. */
export const AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND = "loop_verification" as const;

/**
 * What the person authorized an unattended *repair* to do, when they
 * authorized one at all.
 *
 * Absent means checking only, which is what every authorization written before
 * this existed meant and what every stored one still reads back as. A
 * permission to spend never defaults, so this is opt-in exactly as the
 * authorization itself is.
 */
export type AutomationStudioUnattendedRepairClause = {
  /** Whether a run nobody is watching may obtain a model to repair itself. */
  enabled: boolean;
  /**
   * The most one unattended repair may be estimated to cost, across every call
   * it makes -- the diagnosis, whatever it explores, and the patch.
   *
   * One number rather than a per-call one, because a repair is a run of calls
   * and "a repair may spend up to this" is what a person can reason about;
   * `resolveAutomationStudioRecoveryRunBudget` divides it into per-call shares
   * as it does for every other recovery. It bounds the run *on top of* the
   * policy's own $0.25 ceiling, never above it.
   */
  maxCostUsdPerRun: number;
};

export type AutomationStudioResultCheckAuthorization = {
  /** Always `loop_verification`. Stored so the record states its own bound rather than relying on the reader. */
  taskKind: typeof AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND;
  /** Who turned result checking on. An audit field: it is never re-validated as a live session, which is the point. */
  authorizedByUserId: string;
  /**
   * The Secret Keys unlock the checks draw the key from.
   *
   * Not a secret, and not an identity session: it is the handle a held key
   * unlock is keyed by, and the host checks it against `authorizedByUserId`
   * together, so a mismatched pair opens nothing. It is here because this is
   * the one thing an unattended check genuinely cannot do without -- Core holds
   * no credential, and `revealKey` wants a password nobody is present to give.
   * When the unlock has lapsed the host resolves no provider and the run
   * records `unverified`, which is the failing direction to pick.
   */
  unlockSessionId: string;
  /** The configured LLM key the checks are paid for with. */
  keyId: string;
  /** What every check under this authorization may spend in total before the person renews it. */
  maxTotalCostUsd: number;
  /** The most any single verification call may cost. */
  maxCostUsdPerCall: number;
  grantedAtMs: number;
  /** When checking stops until the person renews. Binds a repair exactly as it binds a check. */
  expiresAtMs: number;
  /**
   * What an unattended *repair* may do under this same permission, or nothing.
   *
   * Absent is the answer for every authorization stored before this clause
   * existed, and it means what it always meant: this Flow may have its results
   * judged with nobody watching, and may not repair itself with nobody
   * watching.
   */
  repair?: AutomationStudioUnattendedRepairClause;
};

/** What redeeming a standing authorization produced: a bounded provider request, or the stated reason there is none. */
export type AutomationStudioResultCheckRedemption =
  | {
    redeemed: true;
    keyId: string;
    /** The key unlock to draw the credential from, and the user it must belong to. Checked together by the host. */
    unlockSessionId: string;
    authorizedByUserId: string;
    /** The narrower of the authorization's per-call ceiling and what it has left in total. */
    maxEstimatedCostUsd: number;
    /** What the authorization has left after the spend already recorded against it. */
    remainingCostUsd: number;
  }
  | {
    redeemed: false;
    /** The stable code recorded on the run, so an unchecked run says why rather than being silent. */
    code: string;
    reason: string;
  };

/**
 * What a standing authorization is bounded by when the person turning checking
 * on names no numbers.
 *
 * A verification call was measured at $0.001483 (four real DeepSeek calls,
 * 2026-09-21), so the default total covers well over six hundred checks -- more
 * than the default schedule reaches in a Flow's first several thousand runs --
 * while still being a number a person can reason about. The per-call ceiling is
 * far above the measured call and far below the grant service's own $0.25, so a
 * verification whose packet grew unexpectedly is refused rather than billed.
 */
export const AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_DEFAULTS = Object.freeze({
  maxTotalCostUsd: 1,
  maxCostUsdPerCall: 0.05,
  ttlMs: 90 * 24 * 60 * 60 * 1000,
  /**
   * What one unattended repair may spend when the person turning repair on
   * names no number. $0.25 is Core's own ceiling for a recovery nobody granted
   * anything for (`run-budget.ts`), so this default authorizes the repair a
   * granted run would have made and nothing wider. Note it is **not** a default
   * for `enabled`: repair stays off until somebody turns it on.
   */
  repairMaxCostUsdPerRun: 0.25
});

/** Why a standing authorization was not redeemed. One code per reason, so a reader can act on it. */
export const AUTOMATION_STUDIO_RESULT_CHECK_AUTHORIZATION_CODES = Object.freeze({
  /** No standing authorization is stored for this Flow: nobody has turned checking on. */
  absent: "core.check.authorization_absent",
  /** The authorization is stored but unusable -- no key, or a ceiling that is not a positive amount. */
  invalid: "core.check.authorization_invalid",
  /** Redemption was asked for a task kind this authorization does not cover. */
  scope: "core.check.authorization_scope",
  /** The authorization has lapsed and the person must renew it. */
  expired: "core.check.authorization_expired",
  /** The cost ceiling the person set has been reached. */
  exhausted: "core.check.authorization_exhausted"
});
