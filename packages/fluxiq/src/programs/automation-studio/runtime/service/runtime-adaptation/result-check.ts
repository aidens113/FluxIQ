// What a finished run's result check comes to: whether this run is checked,
// and, if it is, whether the Flow holds a standing permission that pays for it.
//
// The check itself is not new and nothing here changes it.
// `verifyAutomationStudioRuntimeSessionResult` already runs at the end of every
// finished run and already asks the user's question in the user's terms; what
// was conditional was the *provider*, wired only when a person handed the run
// an execution grant. So this is the whole of the change: a Flow replaying at
// three in the morning, with no actor session anywhere, now reaches a model
// when its schedule says to and its authorization covers it.
//
// Both halves fail closed, and both say why. A run the schedule passed over,
// and a run whose authorization has expired or run out, each record
// `unverified` with a code and a sentence, never `confirmed` -- because a
// result nobody judged reading as a result that was right is the exact failure
// this whole area exists to stop.

import { redeemAutomationStudioResultCheckAuthorization, AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND } from "../../result-check-authorization/index.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS, type AutomationStudioResultCheckDecision, type AutomationStudioResultCheckState } from "../../result-check-schedule/index.ts";
import type { AutomationStudioResultVerificationProvider } from "../../result-verification/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "./contracts.ts";

/** A model the verification may use, with whatever the resolution bounds it to. */
export type AutomationStudioResultCheckProviderResolution = AutomationStudioResultVerificationProvider;

/**
 * Everything the host is told about a redeemed standing authorization: the
 * scope, the key, the unlock to draw it from, and the ceiling for this one
 * call. Never the authorization record, and never a purpose it could widen.
 */
export type AutomationStudioResultCheckProviderRequest = {
  projectId: string;
  flowId: string;
  keyId: string;
  unlockSessionId: string;
  authorizedByUserId: string;
  maxEstimatedCostUsd: number;
};

/** What this run's result check resolved to, recorded on the run whether or not a model was reached. */
export type AutomationStudioRunResultCheck = {
  /** True only when the schedule chose this run *and* an authorization paid for it. */
  checked: boolean;
  epoch: number;
  code: string;
  reason: string;
  /** The ceiling this one verification may spend. Present only when `checked`. */
  maxEstimatedCostUsd?: number;
  /** The key the check is paid for with, and the unlock to draw it from. Present only when `checked`. */
  keyId?: string;
  unlockSessionId?: string;
  authorizedByUserId?: string;
  /** The schedule's own decision, kept whole so a reader can see what the curve said before the money did. */
  decision: AutomationStudioResultCheckDecision;
};

/**
 * Whether this run is checked, and what may be spent on it.
 *
 * `spentUsd` is what the Flow's recent runs have already cost, which
 * `resolveRuntimeAdaptationContext` computes anyway for the training budget.
 * Reusing it is deliberate: the authorization's ceiling and the training
 * window's ceiling are the same kind of promise to the person, and two
 * independent tallies of the same spending would disagree.
 */
export function automationStudioRunResultCheck(input: {
  context: AutomationStudioRuntimeAdaptationContext;
  nowMs: number;
  /** True when a repair landed during this run and the retry produced the result now being judged. */
  repairedThisRun?: boolean;
}): AutomationStudioRunResultCheck {
  const context = input.context;
  const configuration = context.settings.resultCheck;
  const schedule = context.resultCheckSchedule;
  const decision = schedule.decide({
    state: context.resultCheckState,
    settings: configuration?.schedule ?? scheduleFallback(schedule.shape),
    ...(input.repairedThisRun === true ? { repairedThisRun: true } : {})
  });
  if (!decision.check) {
    return { checked: false, epoch: context.resultCheckEpoch, code: decision.code, reason: decision.reason, decision };
  }
  const redemption = redeemAutomationStudioResultCheckAuthorization({
    authorization: configuration?.authorization,
    taskKind: AUTOMATION_STUDIO_RESULT_CHECK_TASK_KIND,
    nowMs: input.nowMs,
    spentUsd: context.budgetState.costUsdThisTrainingWindow
  });
  if (!redemption.redeemed) {
    return { checked: false, epoch: context.resultCheckEpoch, code: redemption.code, reason: redemption.reason, decision };
  }
  return {
    checked: true,
    epoch: context.resultCheckEpoch,
    code: decision.code,
    reason: decision.reason,
    maxEstimatedCostUsd: redemption.maxEstimatedCostUsd,
    keyId: redemption.keyId,
    unlockSessionId: redemption.unlockSessionId,
    authorizedByUserId: redemption.authorizedByUserId,
    decision
  };
}

/**
 * The decision a run that repaired itself and re-ran is judged under.
 *
 * It replaces the decision taken when the run started, and it has to: that one
 * was taken before anyone knew a repair would happen, and it answers the
 * question "is run 4 one the sequence checks?" when the question that matters
 * has become "did the repair produce the right answer?". The run is the same
 * run -- `retryRuntimeSessionAfterAutoAppliedPatch` keeps its id -- so there is
 * one decision and one record either way, and at most one call is ever made.
 *
 * It is not a widening of what may be spent. The same authorization is redeemed
 * on the same terms: a Flow whose ceiling is spent, whose authorization has
 * expired, or whose owner turned checking off records the refusal's own code
 * and asks nobody. Only the schedule's *sequence* is overruled, and only for a
 * run that repaired itself.
 *
 * `null` context is a run with no adaptation context at all, which cannot have
 * repaired itself; its check is returned exactly as it was.
 */
export function automationStudioRepairedRunResultCheck(input: {
  context: AutomationStudioRuntimeAdaptationContext | null;
  check: AutomationStudioRunResultCheck | null;
  nowMs: number;
}): AutomationStudioRunResultCheck | null {
  if (!input.context) return input.check;
  return automationStudioRunResultCheck({ context: input.context, nowMs: input.nowMs, repairedThisRun: true });
}

/**
 * The settings a Flow is checked under when its settings could not be read at
 * all. `resultCheckConfigurationFromMetadata` gives every Flow a configuration,
 * so this is reached only by a caller that built a context by hand -- and the
 * documented defaults are the right answer there too.
 */
function scheduleFallback(shape: AutomationStudioRuntimeAdaptationContext["resultCheckSchedule"]["shape"]) {
  return { ...AUTOMATION_STUDIO_RESULT_CHECK_DEFAULTS, shape };
}

/**
 * The model that judges this run's result, from whichever authority this run
 * actually has -- and nothing when it has neither.
 *
 * Two authorities, in order, and they are not interchangeable. A person's
 * execution grant is a button they just pressed, so it wins and behaves exactly
 * as it did before this existed. The standing authorization is the new path and
 * is the narrower of the two: it names one key, one call ceiling, and the one
 * task kind, and it is reached only after the schedule has already said this
 * run is checked.
 *
 * `resolveStandingProvider` is the host's, because obtaining the key is the
 * host's business and Core holds no credential. It is handed only what the
 * redemption allows -- the key id and the ceiling for this one call -- never
 * the authorization record and never a purpose it could widen.
 */
export async function resolveAutomationStudioResultCheckProvider(input: {
  scope: { projectId: string; flowId: string };
  check: AutomationStudioRunResultCheck | null;
  resolveGrantedProvider?: (() => Promise<AutomationStudioResultCheckProviderResolution | undefined>) | undefined;
  resolveStandingProvider?: ((request: AutomationStudioResultCheckProviderRequest) => Promise<AutomationStudioResultCheckProviderResolution | undefined>) | undefined;
}): Promise<AutomationStudioResultCheckProviderResolution | undefined> {
  const granted = await input.resolveGrantedProvider?.();
  if (granted) return granted;
  const check = input.check;
  if (!check?.checked || !check.keyId || !check.unlockSessionId || !check.authorizedByUserId || check.maxEstimatedCostUsd === undefined || !input.resolveStandingProvider) return undefined;
  const resolved = await input.resolveStandingProvider({ ...input.scope, keyId: check.keyId, unlockSessionId: check.unlockSessionId, authorizedByUserId: check.authorizedByUserId, maxEstimatedCostUsd: check.maxEstimatedCostUsd });
  if (!resolved) return undefined;
  // The redemption's ceiling is applied here as well as wherever the host
  // applied one: `run-outcome.ts` takes the narrower of the two, and a host
  // that returned an unbounded provider must not thereby spend more than the
  // person authorized.
  return { ...resolved, maxEstimatedCostUsd: Math.min(resolved.maxEstimatedCostUsd ?? check.maxEstimatedCostUsd, check.maxEstimatedCostUsd) };
}

/**
 * The epoch this run belongs to: the Flow's own graph revision, as
 * `materializeCanonicalGraphFlow` puts it on the canonical document.
 *
 * 1 where the Flow has no graph revisions yet, which is also what every row
 * written before the 0022 migration reads as, so an existing project's history
 * and its next run are at the same epoch and the count is continuous.
 */
export function automationStudioResultCheckEpoch(graphRevision: unknown): number {
  const revision = Math.trunc(Number(graphRevision));
  return Number.isFinite(revision) && revision >= 1 ? revision : 1;
}

/**
 * The schedule state as the store answered, or an empty one.
 *
 * `null` here means the project has no typed run store to read -- not that the
 * Flow has no runs. Reading it as an empty state makes the next run ordinal 1,
 * so such a deployment checks its first runs rather than silently checking
 * nothing, which is the failing direction to pick.
 */
export function automationStudioResultCheckStateFromRows(
  rows: { ordinal: number; lastCheckedOrdinal: number | null; checksPassed: number; lastStatus: string | null } | null
): AutomationStudioResultCheckState {
  const lastStatus = rows?.lastStatus;
  return {
    // The rows hold finished runs only, so the run that is starting is the next one.
    ordinal: (rows?.ordinal ?? 0) + 1,
    lastCheckedOrdinal: rows?.lastCheckedOrdinal ?? null,
    checksPassed: rows?.checksPassed ?? 0,
    lastStatus: lastStatus === "confirmed" || lastStatus === "refuted" || lastStatus === "unverified" || lastStatus === "no_result" ? lastStatus : null
  };
}
