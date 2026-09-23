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
// `diagnose_and_adapt` and `explore_and_adapt` as well, and the repair a
// refutation triggers is a separate authorization question with a separate
// answer. This record can be redeemed for one task kind and there is no field
// on it that could name another.

/** The one task kind a standing check authorization can ever be redeemed for. */
export const AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND = "loop_verification" as const;

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
  /** When checking stops until the person renews. */
  expiresAtMs: number;
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
  ttlMs: 90 * 24 * 60 * 60 * 1000
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
