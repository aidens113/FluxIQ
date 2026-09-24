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
// **Two things it will not do.**
//
//   - It will not route a run whose grant does not buy exploring. A
//     `diagnose_and_adapt` grant buys one target override under manual review;
//     an exploring loop is not what the person authorised, and reaching it by
//     this door rather than by widening the grant's scope would be the same
//     widening wearing a different hat. Such a run is recorded as needing a
//     grant that buys exploring, which is the escalation the person answers.
//   - It will not route a run whose training context forbids creating
//     adaptations. There would be nothing to propose at the end of it.
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

/** The grant purpose that buys exploring, and so buys this route. */
const EXPLORING_GRANT_PURPOSE = "explore_and_adapt";

/** Where a refuted run's metadata records what became of the route. */
export const AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY = "resultReauthor";

/** Why a refuted run was not re-authored, in codes a reader can key on. */
export type AutomationStudioRefutedResultReauthorRefusal =
  /** The run failed for something other than its answer: the ladder's business. */
  | "not_a_wrong_answer"
  /** No Flow to extend was in hand, so there is no draft to start from. */
  | "flow_unavailable"
  /** The run's grant does not buy exploring. The person answers this one. */
  | "grant_does_not_buy_exploration"
  /** Training settings forbid creating an adaptation, so there is nothing to propose. */
  | "adaptations_not_permitted";

export type AutomationStudioRefutedResultReauthorDecision =
  | { route: true; projectId: string; flowId: string }
  | { route: false; refusal: AutomationStudioRefutedResultReauthorRefusal };

/**
 * Whether this refuted run re-enters the build loop, and with what.
 *
 * Every condition is read off the run and its context rather than asked of a
 * model: which verdict refuted it, whether the Flow is in hand, what the grant
 * buys, and whether anything may be proposed at the end.
 */
export function automationStudioRefutedResultReauthorDecision(input: {
  detail: AutomationStudioFlowRunDetail;
  projectId?: string | undefined;
  flowId?: string | undefined;
  grantPurpose?: string | undefined;
  createAdaptations: boolean;
}): AutomationStudioRefutedResultReauthorDecision {
  if (automationStudioRefutedResultCode(input.detail) !== AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE) {
    return { route: false, refusal: "not_a_wrong_answer" };
  }
  if (!input.projectId || !input.flowId) return { route: false, refusal: "flow_unavailable" };
  if (input.grantPurpose !== EXPLORING_GRANT_PURPOSE) return { route: false, refusal: "grant_does_not_buy_exploration" };
  if (!input.createAdaptations) return { route: false, refusal: "adaptations_not_permitted" };
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
 * **Nothing is widened to make that true, and three gates still stand.** The
 * route is only taken under a grant that already buys exploring, and that grant
 * carries no permitted consequence, so an action with a lasting effect is
 * refused and put to the person exactly as before. The cost, token and deadline
 * ledger bounds the build. And `approve` itself refuses a record whose
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
  /** The caller's own reading of a thrown value; codes only, never a message. */
  failureCode(error: unknown): string;
}): Promise<{ adaptationId?: string; applied?: true; failureCode?: string }> {
  let adaptationId: string;
  try {
    adaptationId = await input.generate();
  } catch (error) {
    return { failureCode: input.failureCode(error) };
  }
  // From here the edit exists, so its id travels whatever happens next: an
  // approval refused for an unanswered permission question has still produced a
  // proposal, and the person's answer is what it is waiting for.
  try {
    await input.approve(adaptationId);
    await input.apply(adaptationId);
  } catch (error) {
    return { adaptationId, failureCode: input.failureCode(error) };
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
  failureCode?: string | undefined;
}): AutomationStudioFlowRunDetail {
  return {
    ...input.detail,
    metadata: {
      ...(input.detail.metadata ?? {}),
      [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: input.decision.route
        ? { routed: true, ...(input.adaptationId ? { adaptationId: input.adaptationId } : {}), ...(input.applied ? { applied: true } : {}), ...(input.failureCode ? { code: input.failureCode } : {}) }
        : { routed: false, code: input.decision.refusal }
    }
  };
}

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
