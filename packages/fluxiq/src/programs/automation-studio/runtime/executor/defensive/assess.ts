import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioFaultAssessment, AutomationStudioFaultEffect } from "./contracts.ts";
import { automationStudioNodeDeclaresNoLastingAct } from "./declared-no-lasting-act.ts";
import { automationStudioNodeActLasts } from "./lasting-act.ts";
import { automationStudioNodeMutates, automationStudioNodeRepeatCannotAct, automationStudioNodeRepeatIsSafe } from "./node-side-effect.ts";
import { automationStudioFaultNotLanded } from "./not-landed.ts";
import { automationStudioFaultFromResultMessage } from "./result-message.ts";
import { automationStudioRetryHintMs } from "./retry-hint.ts";

/**
 * The one question the runtime asks about a failed attempt: is this a fault the
 * run absorbs, and why.
 *
 * The order is deliberate. A fault classified where it happened -- a thrown value,
 * caught at the dispatch seam with the error object still in hand -- outranks
 * everything, because that is the richest evidence there will ever be. Next the
 * producer's own structured record, which is its considered answer and is not
 * second-guessed: a domain that states `retryable: false` has said the same
 * request will be answered the same way, and Core overriding that would spend the
 * time of the run arguing with the only code that knows. Last, the message, for
 * every node that reports a failure without a record at all.
 *
 * Three gates then apply, and all exist to stop a retry becoming a second act.
 * The first two ask the question from opposite ends, because the evidence differs:
 *
 *  1. **The failure was found after the action ran** -- stage `confirmation` or
 *     `verification`. That is evidence the action ran, so looking again needs a
 *     positive reason: `automationStudioNodeRepeatCannotAct`.
 *  2. **The fault itself is `ambiguous`** -- the request went out and only the
 *     answer was lost. That is no evidence either way, so the node keeps its
 *     retries unless it acts on the world. A fault that demonstrably never
 *     reached anything (`unacted`) is repeated freely, however consequential the
 *     node is, because nothing happened to repeat.
 *  3. **The act lasts and its effect is unknown** (t359) -- the node's step
 *     declared a lasting consequence, or the producer's record states the act
 *     was made (`effect: "ambiguous"`). Gate 2 asks the same question of a
 *     node marked as acting on the world; this one hears it from the two
 *     places a web press can say it, since a Flow's web node is marked with
 *     nothing (`./lasting-act.ts`). Both refuse with `actUncertain`.
 *
 * **The stage used to end it on its own, for every node, and that was the single
 * biggest measured cause of lost runs.** Eleven of roughly eighteen reportable
 * live runs died on `web.validation.output_not_observed`, which the domain
 * declares `retryable: true` and which the stage check discarded because its
 * stage is `verification`. The reasoning was sound for a mutating action -- a
 * failure found after the action ran must not be re-dispatched, that is how a
 * double submit happens -- and wrong for a read: a list that came back empty
 * because the page had not finished drawing is the commonest live failure there
 * is, and refusing to look again is refusing the one thing that would work. The
 * stage was being used as a proxy for side-effect safety and does not carry it;
 * the question is now asked of the node directly, which is where the answer is.
 */
export function automationStudioAssessAttemptFault(
  attempt: AutomationStudioNodeAttemptTrace,
  node: AutomationStudioFlowNode | undefined,
  now = 0
): AutomationStudioFaultAssessment | undefined {
  if (attempt.status !== "failed") return undefined;
  const base = attempt.fault
    ?? (attempt.failure ? faultFromRecord(attempt.failure) : undefined)
    ?? automationStudioFaultFromResultMessage(attempt.message);
  if (!base) return undefined;
  // The producer's own record states its wait before anything the node returned
  // is searched for one: a page's "try again in 12 seconds" travels there.
  const hinted = base.hintedWaitMs
    ?? (attempt.failure ? automationStudioRetryHintMs(attempt.failure, now) : undefined)
    ?? automationStudioRetryHintMs(attempt.outputs, now);
  const fault: AutomationStudioFaultAssessment = { ...base, ...(hinted === undefined ? {} : { hintedWaitMs: hinted }) };
  // The effect check already showed this act did not happen (C6 step 4), so it is unacted, whatever the gates below would say.
  if (attempt.effectCheck?.result === "not_landed") return automationStudioFaultNotLanded(fault);
  // An act that answered success, rejected afterwards by the host's verdict on its expected state -- the
  // evaluator's conditions or its step's own facts (t413), stage `verification`: the act happened, so a lasting
  // one is never made again and its outcome is not uncertain -- no effect check, a true failure (`./effect-check.ts`).
  // A step whose act does not last goes on to the gates below and keeps its ordinary retry.
  if (rejectedAfterSuccess(attempt) && node && automationStudioNodeActLasts(node)) {
    return { ...fault, disposition: "refuse", reason: `${node.id} made a lasting act that answered success, and the page did not then show what it was meant to leave: that is found after acting, so the act is not made again.` };
  }
  if (fault.disposition === "refuse") return refusalWithUnknownOutcome(attempt, node, fault) ?? fault;
  const stage = fault.stage ?? attempt.failure?.stage;
  const foundAfterActing = stage === "confirmation" || stage === "verification";
  // Core owns both rules rather than the producer, because they are about the
  // consequence of the node and not about the fault: a producer reporting
  // `retryable: true` on the action that spends money is answering a different
  // question.
  // A failure found after the action ran is evidence the action ran, so looking
  // again needs a positive reason rather than the absence of a reason not to. With
  // no node at all Core has none, and gives the cautious answer.
  if (foundAfterActing && !(node && automationStudioNodeRepeatCannotAct(node))) {
    return {
      ...fault,
      disposition: "refuse",
      ...(node && fault.effect !== "unacted" && automationStudioNodeActLasts(node) ? { actUncertain: true as const } : {}),
      reason: node
        ? `The failure was found at ${stage}, after the action had already run, and nothing about ${node.id} says that running it again could not act a second time.`
        : `The failure was found at ${stage}, after the action had already run, and no node was named to say whether running it again could act a second time.`
    };
  }
  if (fault.effect === "ambiguous" && node && automationStudioNodeMutates(node) && !automationStudioNodeRepeatIsSafe(node)) {
    return {
      ...fault,
      disposition: "refuse",
      actUncertain: true,
      reason: `${fault.reason} This node acts outside the run and does not state that repeating it is safe, so the act may already have landed and is not repeated.`
    };
  }
  // 3. **A lasting act whose effect is unknown** (t359): the step declared a
  //    lasting consequence, or the producer itself stated the act was made and
  //    only its answer is missing (`./lasting-act.ts`). Repeated only when the
  //    failure shows the act did not happen.
  //    A step that declared no lasting consequence answers the producer's
  //    "it may have acted": nothing it does lasts (`./declared-no-lasting-act.ts`).
  const producerSaysActed = attempt.failure?.effect === "ambiguous"
    && !(node && (automationStudioNodeRepeatIsSafe(node) || automationStudioNodeDeclaresNoLastingAct(node)));
  if (fault.effect !== "unacted" && (producerSaysActed || (node && automationStudioNodeActLasts(node)))) {
    return {
      ...fault,
      disposition: "refuse",
      effect: "ambiguous",
      actUncertain: true,
      reason: `${node ? `${node.id} makes a lasting act` : "The act lasts"}, and ${fault.code} does not show that it did not happen: it may already have taken effect and nothing showed whether it did, so it is not made again.`
    };
  }
  return fault;
}

/**
 * A refusal that still leaves a lasting act's outcome unknown (C8): the
 * producer's record states the act was made (`effect: "ambiguous"`) and that
 * what came of it is unknown (`ambiguous_or_unknown`). A lost command reported
 * `interrupted` on a committing act reads exactly so (`web.action.unknown`,
 * `retryable: false`). The record's `retryable: false` says the same request
 * would be answered the same way; it does not say the act did not happen, so
 * the refusal is marked `actUncertain` and the effect check runs before any
 * route or alternative.
 *
 * Every other refusal is the producer's answer about what happened -- a page
 * that rejected the press, a dialog in the way, a sign-in wall -- and keeps the
 * handling it always had. So does a fault classified from a throw, which
 * carries no producer statement about the act.
 */
function refusalWithUnknownOutcome(attempt: AutomationStudioNodeAttemptTrace, node: AutomationStudioFlowNode | undefined, fault: AutomationStudioFaultAssessment): AutomationStudioFaultAssessment | undefined {
  if (fault.actUncertain || fault.effect === "unacted" || fault.category !== "ambiguous_or_unknown") return undefined;
  if (attempt.failure?.effect !== "ambiguous" || (node && automationStudioNodeRepeatIsSafe(node))) return undefined;
  return {
    ...fault,
    effect: "ambiguous",
    actUncertain: true,
    reason: `${node ? `${node.id} made an act` : "An act was made"} whose outcome ${fault.code} reports as unknown: it may already have taken effect, so it is not made again.`
  };
}

/**
 * Whether the attempt's act answered success and the host's verdict on its
 * expected state then failed it (`../transition-comparison.ts`): only that
 * demotion leaves a failed attempt with a host-judged comparison, and it always
 * carries stage `verification`.
 */
function rejectedAfterSuccess(attempt: AutomationStudioNodeAttemptTrace): boolean {
  return attempt.transitionComparison?.metadata?.hostEvaluated === true && attempt.failure?.stage === "verification";
}

/** Whether this failed attempt may be dispatched again under the default policy. */
export function automationStudioAttemptFaultIsAbsorbed(
  attempt: AutomationStudioNodeAttemptTrace,
  node: AutomationStudioFlowNode | undefined,
  now = 0
): boolean {
  return automationStudioAssessAttemptFault(attempt, node, now)?.disposition === "retry";
}

/**
 * The producer's own record, read as an assessment.
 *
 * `retryable` is the producer answering exactly this question, so it decides the
 * disposition. The effect is the producer's when it states one: a record marked
 * `unacted` says the act demonstrably did not happen -- a page that refused a
 * press as "too fast" and confirmed nothing -- so a mutating node may make it
 * again. Without that statement the reading is conservative: only a failure
 * while resolving the action's target demonstrably happened before anything
 * could act, so everything else is ambiguous and a mutating node keeps its
 * protection.
 */
function faultFromRecord(record: AutomationStudioFailureRecord): AutomationStudioFaultAssessment {
  const effect: AutomationStudioFaultEffect = record.effect
    ?? (record.stage === "target_resolution" || record.category === "target_not_found" || record.category === "target_ambiguous"
      ? "unacted"
      : "ambiguous");
  return {
    disposition: record.retryable ? "retry" : "refuse",
    category: record.category,
    code: record.code,
    source: "failure_record",
    effect,
    reason: record.retryable
      ? `The producer reported ${record.category} as retryable, so the same request may be made again.`
      : `The producer reported ${record.category} as not retryable, so the same request would be answered the same way.`,
    ...(record.stage === undefined ? {} : { stage: record.stage })
  };
}
