// Which grant a runtime session accepts, and what that grant makes the run.
//
// This lived inline in `runRuntimeSession`, where two unrelated things were
// welded together: *what a person granted* and *how many provider calls the
// recovery may make*. The session accepted `diagnosis_only` and
// `diagnose_and_adapt` and nothing else, and `diagnose_and_adapt` was pinned at
// exactly two calls with no way to gather evidence. Against a real provider the
// model's first move is to ask for more evidence, the one call that could serve
// it was forbidden, and the recovery ended with a staged diagnosis nobody had
// validated -- a run that passed its scenario while diagnosing nothing.
//
// So the two things are separated here. A purpose says what the run may ask a
// provider for; it no longer says how many times. How many times is
// configuration on the grant, bounded by the guards that are meant to bind --
// cost, tokens, the recovery deadline and a lack of progress -- and by one high
// absolute backstop in `execution/grants.ts` that exists only to stop a runaway
// loop.
//
// Four purposes reach a runtime session, and they are not interchangeable:
//
// - `verify_result` changes nothing about how the run executes. It is a run
//   with no grant, plus the one call that asks whether the finished run's
//   result answers the request. Without it a run's result could never be
//   judged unless the person had also authorized a recovery.
// - `diagnosis_only` asks one question and changes nothing.
// - `diagnose_and_adapt` is the narrow grant a person may already hold. It now
//   iterates and may gather evidence, because that is what diagnosing actually
//   requires, but what it may *change* is unchanged: one target override, as a
//   proposal, under manual review.
// - `explore_and_adapt` is the iterating recovery. It explores on its own and
//   is bounded by the project's configured budgets and the recovery deadline
//   rather than by a call count, and it is held to the policy's own mutation
//   flags instead of being handed a target-override exemption.

import type { AutomationStudioRuntimeAdaptationContext } from "../service.ts";
/** The grant purposes a runtime session will run under. */
export const AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES = ["diagnosis_only", "diagnose_and_adapt", "explore_and_adapt", "build_and_adapt", "verify_result"] as const;

export type AutomationStudioRuntimeSessionGrantPurpose = (typeof AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES)[number];

export type AutomationStudioRuntimeSessionGrant = {
  grantId: string;
  actorUserId: string;
  actorSessionId: string;
  purpose: AutomationStudioRuntimeSessionGrantPurpose;
};

/** The adaptation context this run actually executes under, given its grant.
 *
 * An explicit grant is a person pressing a button, so the run invokes the model
 * and records what it finds whatever the training mode would have decided. What
 * differs between the purposes is what the run may then *change*. */
export function automationStudioRuntimeAdaptationContextForGrant(
  context: AutomationStudioRuntimeAdaptationContext,
  purpose: AutomationStudioRuntimeSessionGrantPurpose
): AutomationStudioRuntimeAdaptationContext {
  return {
    ...context,
    behavior: { ...context.behavior, invokeLlm: true, createAdaptations: true, promoteAdaptations: true },
    diagnostics: [...context.diagnostics, `Explicit ${purpose} run iterates under the configured cost, token and deadline budgets.`]
  };
}
