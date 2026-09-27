// Where a wrong answer goes, now that it has somewhere to go.
//
// **The finding this acts on.** A run refuted as not answering the request
// entered the failure entry point and was classified
// `recovery_path_or_reroute`, whose whole allowed set is the five runtime
// `temporary_*` patches. None of them could have helped: a reroute only joins
// two nodes that already exist, a recovery subflow call needs a recovery
// subflow, and the Flow in question was navigate then extract -- there was no
// search node to route to, because the Flow never had one. The ladder is for a
// step that broke. This is a Flow missing a step, and the only thing that finds
// a missing step is the loop that finds steps: the build's own.
//
// **So the verdict is routed, not patched.** A run refuted for its answer hands
// control to the exploration-and-authoring loop with the Flow it just ran as
// the starting draft (`flow-bootstrap/extend.ts`), and the patch ladder is left
// to the failures it is actually for. This module is the decision and the
// record of it; the call itself belongs to the service, which is the only thing
// holding a provider resolver, a grant and a node registry.
//
// **What it will not do, which is now only one thing: route a failure that is
// not a wrong answer, or one whose Flow it has not got.** Both are statements
// about what is in hand rather than permissions -- there is nothing to
// re-author, so there is nothing to allow.
//
// **It used to ask two permission questions here, and both were the t166 bug.**
// The route was closed unless the run's grant purpose was one that "buys
// exploring", and closed again unless the run's training context permitted
// creating adaptations. Repairing a Flow that gave the wrong answer is not a
// risky act: it edits a Flow, and a Flow is versioned and rolls back. A grant
// exists to gate a lasting real-world consequence -- money, a deletion, a
// publication -- and every one of those is still gated, action by action, by
// the permission gate this route runs under, which holds no permitted
// consequence at all. Gating the *repair* on the grant's name protected nobody
// and disabled the feature outright: five live runs reached
// `grant_does_not_buy_exploration` and stopped, and the wrong-answer repair had
// never once executed.
//
// Every refusal is recorded on the run under one key with one code, so "this
// was not re-authored" is always a stated reason rather than a silence.

import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AUTOMATION_STUDIO_RESULT_VERDICT_CODES } from "../../result-verification/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY } from "./repair.ts";

/**
 * Core's code for the verdict this routes on.
 *
 * Written here rather than imported, because the value edge would close a cycle
 * -- `result-verification/run-outcome.ts` already calls into this directory --
 * and typed against the table it comes from, so the two cannot drift: renaming
 * the code there is a compile error here.
 */
export const AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE: (typeof AUTOMATION_STUDIO_RESULT_VERDICT_CODES)["doesNotAnswer"] = "core.result.does_not_answer_request";


/** Where a refuted run's metadata records what became of the route. */
export const AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY = "resultReauthor";

/** Why a refuted run was not re-authored, in codes a reader can key on. */
export type AutomationStudioRefutedResultReauthorRefusal =
  /** The run failed for something other than its answer: the ladder's business. */
  | "not_a_wrong_answer"
  /** No Flow to extend was in hand, so there is no draft to start from. */
  | "flow_unavailable";

export type AutomationStudioRefutedResultReauthorDecision =
  | { route: true; projectId: string; flowId: string }
  | { route: false; refusal: AutomationStudioRefutedResultReauthorRefusal };

/**
 * Whether this refuted run re-enters the build loop, and with what.
 *
 * Every condition is read off the run rather than asked of a model, and there
 * are only two: which verdict refuted it, and whether the Flow it would extend
 * is in hand. Nothing about the grant is consulted, because nothing about
 * repairing a Flow needs permission.
 */
export function automationStudioRefutedResultReauthorDecision(input: {
  detail: AutomationStudioFlowRunDetail;
  projectId?: string | undefined;
  flowId?: string | undefined;
}): AutomationStudioRefutedResultReauthorDecision {
  if (automationStudioRefutedResultCode(input.detail) !== AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE) {
    return { route: false, refusal: "not_a_wrong_answer" };
  }
  if (!input.projectId || !input.flowId) return { route: false, refusal: "flow_unavailable" };
  return { route: true, projectId: input.projectId, flowId: input.flowId };
}

/** The verdict code the verification wrote when it took this run to the failure entry point. */
function automationStudioRefutedResultCode(detail: AutomationStudioFlowRunDetail): string {
  const marker = detail.metadata?.[AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return "";
  const code = (marker as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

/**
 * Builds the edit, then approves and applies it, so the Flow on disk is the
 * corrected one before anything runs again.
 *
 * **Why this applies itself.** A repair is required to be automatic. A run that
 * files an edit and waits for somebody to press approve has produced a receipt
 * nobody is shown, which is the behaviour the whole failure entry point exists
 * to end. The authority is the person's own instruction: they asked for the
 * answer, and the bounded, non-destructive means of getting it are authorised
 * by that ask rather than by a second, per-occurrence press.
 *
 * **Nothing is widened to make that true, and the gates that matter still
 * stand.** The grant the route runs under carries no permitted consequence, so
 * an action with a lasting effect is refused and put to the person exactly as
 * before. The cost, token and deadline ledger bounds the build. And `approve`
 * itself refuses a record whose
 * permission request nobody has answered
 * (`assertAutomationStudioBootstrapPermissionAnswered`), so a build that had to
 * ask a question stops here with the question outstanding instead of applying
 * a Flow containing a step nobody allowed.
 *
 * **This is a policy for this route only.** A Flow Bootstrap adaptation reached
 * any other way is still proposed for review; nothing here changes how
 * adaptations are promoted in general.
 */
export async function automationStudioReauthorRefutedResult(input: {
  /** Builds the extend-mode adaptation and answers its id. */
  generate(): Promise<string>;
  approve(adaptationId: string): Promise<unknown>;
  apply(adaptationId: string): Promise<unknown>;
  /**
   * The caller's own reading of a thrown value; codes, flags and counts only,
   * never a message.
   *
   * **It returned the code alone, and the code alone could not be acted on.**
   * `run-muhqop38-997ee8e5` was the first run in which this route opened, and
   * it recorded `flow_bootstrap.provider_request_failed` — which is the default
   * code for the whole `provider_request` stage, so it says only that a request
   * was attempted and its answer is unknown. Whether that was a per-request
   * timeout, a transport error, a refused grant or a provider status was
   * computed in the diagnostic the caller already parses, and thrown away here.
   */
  failureCode(error: unknown): AutomationStudioRefutedResultFailure;
}): Promise<{ adaptationId?: string; applied?: true; failure?: AutomationStudioRefutedResultFailure }> {
  let adaptationId: string;
  try {
    adaptationId = await input.generate();
  } catch (error) {
    return { failure: input.failureCode(error) };
  }
  // From here the edit exists, so its id travels whatever happens next: an
  // approval refused for an unanswered permission question has still produced a
  // proposal, and the person's answer is what it is waiting for.
  try {
    await input.approve(adaptationId);
    await input.apply(adaptationId);
  } catch (error) {
    return { adaptationId, failure: input.failureCode(error) };
  }
  return { adaptationId, applied: true };
}

/**
 * The run, carrying what became of the route.
 *
 * A routed run records the adaptation it produced, whether that edit reached
 * the Flow, and the code any step of it failed under; a run that was not routed
 * records why. Both are on the run itself, because the run detail is what the
 * next reader has -- an evaluation, a person, or the next agent looking at why
 * nothing changed.
 */
export function automationStudioRefutedResultReauthored(input: {
  detail: AutomationStudioFlowRunDetail;
  decision: AutomationStudioRefutedResultReauthorDecision;
  adaptationId?: string | undefined;
  applied?: true | undefined;
  failure?: AutomationStudioRefutedResultFailure | undefined;
}): AutomationStudioFlowRunDetail {
  const failure = input.failure;
  return {
    ...input.detail,
    metadata: {
      ...(input.detail.metadata ?? {}),
      [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: input.decision.route
        ? {
            routed: true,
            ...(input.adaptationId ? { adaptationId: input.adaptationId } : {}),
            ...(input.applied ? { applied: true } : {}),
            ...(failure ? { code: failure.code } : {}),
            // Everything the diagnostic knew that a reader can act on. Each is
            // absent when the caller could not read it, so "not recorded" and
            // "recorded as none" stay different facts.
            ...(failure?.stage ? { stage: failure.stage } : {}),
            ...(failure?.retryable === undefined ? {} : { retryable: failure.retryable }),
            ...(failure?.providerInvocation ? { providerInvocation: failure.providerInvocation } : {}),
            ...(failure?.providerResponse ? { providerResponse: failure.providerResponse } : {}),
            ...(failure?.providerStatus === undefined ? {} : { providerStatus: failure.providerStatus })
          }
        : { routed: false, code: input.decision.refusal }
    }
  };
}

/**
 * What a reader is told about a step of this route that failed: the code, and
 * the closed facts around it that say which kind of failure it was.
 *
 * Codes, flags and a status number only, because this is written onto the run
 * and published from there.
 */
export type AutomationStudioRefutedResultFailure = {
  code: string;
  stage?: string | undefined;
  retryable?: boolean | undefined;
  providerInvocation?: "not_attempted" | "attempted" | "unknown" | undefined;
  providerResponse?: "not_received" | "received" | "unknown" | undefined;
  providerStatus?: number | undefined;
};

/**
 * Whether this run's Flow was actually changed by a re-authoring.
 *
 * What the re-run is keyed on, and deliberately narrower than "was routed": a
 * route that built an edit and could not apply it has changed nothing, and
 * running the same Flow again would spend a second verification to reach the
 * same wrong answer.
 */
export function automationStudioRefutedResultFlowWasReauthored(detail: AutomationStudioFlowRunDetail): boolean {
  const marker = detail.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return false;
  return (marker as { applied?: unknown }).applied === true;
}
