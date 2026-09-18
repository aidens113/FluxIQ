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
// absolute backstop in `execution-grants.ts` that exists only to stop a runaway
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
import { automationStudioLlmExecutionGrantTaskKinds } from "./grant-capabilities.ts";
import type { AutomationStudioLlmTaskKind } from "./harness.ts";

/** The grant purposes a runtime session will run under. `build_and_adapt` is
 * absent on purpose: creating a Flow from nothing is a different entry point. */
export const AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES = ["diagnosis_only", "diagnose_and_adapt", "explore_and_adapt", "verify_result"] as const;

export type AutomationStudioRuntimeSessionGrantPurpose = (typeof AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES)[number];

export type AutomationStudioRuntimeSessionGrant = {
  grantId: string;
  actorUserId: string;
  actorSessionId: string;
  purpose: AutomationStudioRuntimeSessionGrantPurpose;
};

/** The run flags an explicit LLM run may not carry, whatever its purpose. */
export type AutomationStudioRuntimeSessionGrantFlags = {
  adaptiveMode?: string | undefined;
  dryRunLlm?: boolean | undefined;
  authorizedExternalSideEffects?: boolean | undefined;
  authorizedDomainIds?: readonly string[] | undefined;
  runId?: string | undefined;
};

/** Why this session may not run under this grant, or `undefined` when it may. */
export function automationStudioRuntimeSessionGrantRefusal(
  grant: { purpose: string },
  flags: AutomationStudioRuntimeSessionGrantFlags
): string | undefined {
  const supported = (AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES as readonly string[]).includes(grant.purpose);
  const incompatible = !supported
    || (flags.adaptiveMode !== undefined && flags.adaptiveMode !== "manual_approval")
    || flags.dryRunLlm === true
    || flags.authorizedExternalSideEffects === true
    || (flags.authorizedDomainIds?.length ?? 0) > 0
    || flags.runId !== undefined;
  return incompatible ? "Explicit LLM execution flags are incompatible." : undefined;
}

/** What the recovery entry point may ask a provider for under this grant.
 *
 * Narrower than the grant itself by design. The grant says what a person
 * authorized; this says what *this* path is allowed to spend it on, so an
 * `explore_and_adapt` grant cannot reach instruction suggestions or change
 * proposals merely by arriving through a failed run. `evidence_tool_decision`
 * is here because gathering evidence is the first thing a real model asks for,
 * and forbidding it is what left diagnoses unvalidated. */
export function automationStudioRuntimeSessionGrantTaskKinds(purpose: AutomationStudioRuntimeSessionGrantPurpose): readonly AutomationStudioLlmTaskKind[] {
  const granted = automationStudioLlmExecutionGrantTaskKinds(purpose);
  return AUTOMATION_STUDIO_RUNTIME_SESSION_TASK_KINDS.filter((taskKind) => granted.includes(taskKind));
}

const AUTOMATION_STUDIO_RUNTIME_SESSION_TASK_KINDS: readonly AutomationStudioLlmTaskKind[] = Object.freeze([
  "runtime_diagnosis",
  "evidence_tool_decision",
  "runtime_patch",
  "loop_plan",
  "loop_verification"
]);

/** The adaptation context this run actually executes under, given its grant.
 *
 * An explicit grant is a person pressing a button, so the run invokes the model
 * and records what it finds whatever the training mode would have decided. What
 * differs between the purposes is what the run may then *change*. */
export function automationStudioRuntimeAdaptationContextForGrant(
  context: AutomationStudioRuntimeAdaptationContext,
  purpose: AutomationStudioRuntimeSessionGrantPurpose
): AutomationStudioRuntimeAdaptationContext {
  if (purpose === "diagnosis_only") return context;
  if (purpose === "verify_result") {
    // The grant authorizes no diagnosis, so the run may not ask for one: with
    // `invokeLlm` off the recovery is never offered the model and records why,
    // rather than resolving a provider only to have the grant refuse the call.
    // Deterministic recovery stays as configured, exactly as for a run with no
    // grant at all.
    return {
      ...context,
      behavior: { ...context.behavior, invokeLlm: false, createAdaptations: false, promoteAdaptations: false },
      diagnostics: [...context.diagnostics, "Explicit verify_result run executes without LLM intervention; its one call judges the finished run's result."]
    };
  }
  if (purpose === "diagnose_and_adapt") {
    return {
      ...context,
      behavior: { ...context.behavior, invokeLlm: true, runRecovery: false, createAdaptations: true, promoteAdaptations: true },
      policy: {
        ...context.policy,
        proposalMode: "manual",
        // The narrow grant is schema-bound to one target-override proposal.
        // Permit only that mutation class; preflight still forbids execution and
        // the ordinary PIN-gated review path remains required for application.
        allowModifyActionTargets: true
      },
      diagnostics: [...context.diagnostics, "Explicit diagnose_and_adapt run permits one target-override proposal with manual review only."]
    };
  }
  return {
    ...context,
    // `runRecovery` stays as configured: a known deterministic recovery is the
    // cheaper answer and must still run before the model is asked.
    behavior: { ...context.behavior, invokeLlm: true, createAdaptations: true, promoteAdaptations: true },
    // No mutation exemption. An exploring run is held to the policy flags a
    // person actually set, and is bounded by cost, tokens and the recovery
    // deadline rather than by a call count.
    policy: { ...context.policy, proposalMode: "manual" },
    diagnostics: [...context.diagnostics, "Explicit explore_and_adapt run iterates under the configured cost, token and deadline budgets, with manual review only."]
  };
}
