// What an execution grant may ask a provider for, by purpose.
//
// These declarations are the grant's authorization table: which purposes
// exist, which task kinds and output shapes each may request, and whether a
// purpose may make more than one call. `execution/grants.ts` enforces them on
// every call; this file is only what they say.

import type {
  AutomationStudioLlmTaskKind,
  AutomationStudioLlmTaskRequest,
  AutomationStudioLlmTokenLimits
} from "./harness.ts";

/**
 * What a grant authorizes. These are entry points into one improvement loop,
 * not separate systems: `build_and_adapt` is a person asking for a new Flow,
 * `explore_and_adapt` is a run that failed or an existing Flow that met an edge
 * case, `diagnose_and_adapt` is the narrower answer for a caller that wants a
 * diagnosis and one target-override proposal, and `diagnosis_only` asks one
 * question and changes nothing.
 *
 * `verify_result` is the narrowest of all: one question about a finished run's
 * result -- does what came back answer what was asked? -- asked at most twice,
 * and nothing else. It exists because every provider call needs a person's
 * grant, a run carrying no grant therefore could never have its result judged,
 * and on 2026-09-18 seven newly built Flows returned the wrong records and
 * reported `passed` for exactly that reason. A run under it executes as
 * deterministically as one with no grant at all: it may not diagnose, gather,
 * patch or propose.
 *
 * A purpose says what may be *asked for*. It no longer says how many times,
 * except for the two that cannot iterate, whose fixed allowance is part of
 * what they are. `diagnose_and_adapt` used to mean "exactly two calls and no
 * exploration", which read as a consent boundary and behaved as a defect: the
 * model's first move on a real failure is to ask for more evidence, the call
 * that serves it was forbidden by the name on the grant, and the diagnosis was
 * left staged and unvalidated. Gathering evidence is part of diagnosing, so every adapting
 * purpose may do it, and what still separates the purposes is what they may
 * change afterwards.
 */
export type AutomationStudioLlmExecutionGrantPurpose = "diagnosis_only" | "diagnose_and_adapt" | "explore_and_adapt" | "build_and_adapt" | "verify_result";

export type AutomationStudioLlmExecutionGrantResolvePolicy = {
  allowedTaskKinds?: readonly AutomationStudioLlmTaskKind[];
};

/** The parts of a stored grant a request is checked against. */
export type AutomationStudioLlmGrantRequestBounds = {
  purpose: AutomationStudioLlmExecutionGrantPurpose;
  projectId: string;
  flowId: string;
  timeoutMs: number;
  maxEstimatedCostUsd: number;
  tokenLimits: AutomationStudioLlmTokenLimits;
};

export function parseAutomationStudioLlmExecutionGrantPurpose(value: unknown): AutomationStudioLlmExecutionGrantPurpose {
  if (value === undefined || value === "diagnosis_only") return "diagnosis_only";
  if (value === "diagnose_and_adapt") return "diagnose_and_adapt";
  if (value === "explore_and_adapt") return "explore_and_adapt";
  if (value === "build_and_adapt") return "build_and_adapt";
  if (value === "verify_result") return "verify_result";
  throw new Error("LLM execution grant purpose is unsupported.");
}

/** One thing a grant may ask a provider for: a task kind and the single output
 * shape that task kind is allowed to return under a grant. */
type GrantTaskAllowance = { taskKind: AutomationStudioLlmTaskKind; expectedOutput: AutomationStudioLlmTaskRequest["expectedOutput"] };

/** What a purpose may ask for, and whether it may ask more than once.
 *
 * For a purpose that iterates, the number of calls is configuration and this
 * says nothing about it. A purpose that does not iterate has a fixed
 * allowance, `calls`, by arity rather than by budget: absent is one. */
type GrantCapability = { iterates: boolean; calls?: number; taskKinds: readonly GrantTaskAllowance[] };

const DIAGNOSIS_TASK_KINDS: readonly GrantTaskAllowance[] = Object.freeze([
  { taskKind: "runtime_diagnosis", expectedOutput: "diagnosis" }
]);

// The two stages that ask the model for a judgement rather than for a change.
// Deliberately not extended to `diagnosis_only`, whose one call is a diagnosis.
const LOOP_PROTOCOL_TASK_KINDS: readonly GrantTaskAllowance[] = Object.freeze([
  { taskKind: "loop_plan", expectedOutput: "diagnosis" },
  { taskKind: "loop_verification", expectedOutput: "diagnosis" }
]);

/** Judging a finished run's result, and only that: the one verification call. */
const VERIFICATION_TASK_KINDS: readonly GrantTaskAllowance[] = Object.freeze([
  { taskKind: "loop_verification", expectedOutput: "diagnosis" }
]);

/** Diagnosing a failure, for real: look, ask for more, decide, repair. The
 * `evidence_tool_decision` call is what turns a staged guess into something the
 * run actually checked, so every adapting purpose has it. */
const RECOVERY_TASK_KINDS: readonly GrantTaskAllowance[] = Object.freeze([
  ...DIAGNOSIS_TASK_KINDS,
  { taskKind: "evidence_tool_decision", expectedOutput: "evidence_tool_decision" },
  { taskKind: "runtime_patch", expectedOutput: "runtime_patch" },
  ...LOOP_PROTOCOL_TASK_KINDS
]);

/** Everything `build_and_adapt` may do except create a Flow from nothing. */
const EXPLORE_TASK_KINDS: readonly GrantTaskAllowance[] = Object.freeze([
  ...RECOVERY_TASK_KINDS,
  { taskKind: "instruction_suggestion", expectedOutput: "instruction_suggestion" },
  { taskKind: "router_patch", expectedOutput: "change_proposal" },
  { taskKind: "subflow_patch", expectedOutput: "change_proposal" },
  { taskKind: "expectation_action_target_patch", expectedOutput: "change_proposal" },
  { taskKind: "change_proposal_generation", expectedOutput: "change_proposal" }
]);

const GRANT_CAPABILITIES: Readonly<Record<AutomationStudioLlmExecutionGrantPurpose, GrantCapability>> = Object.freeze({
  diagnosis_only: { iterates: false, taskKinds: DIAGNOSIS_TASK_KINDS },
  // Iterating now, and able to gather. What it may *change* is unchanged: the
  // patch stage still holds it to one target override, as a proposal.
  diagnose_and_adapt: { iterates: true, taskKinds: RECOVERY_TASK_KINDS },
  explore_and_adapt: { iterates: true, taskKinds: EXPLORE_TASK_KINDS },
  build_and_adapt: { iterates: true, taskKinds: Object.freeze([...EXPLORE_TASK_KINDS, { taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" } as GrantTaskAllowance]) },
  // Two calls, never a loop. Any answer but `yes` -- a `no` or an `unknown`
  // -- is asked once more with the same evidence, because either fails a run
  // whose every step succeeded, and at temperature 0 both were measured to flip
  // on identical rows (2026-09-18; 2026-09-21, when the same 14 rows came back
  // `unknown` two times in ten). Asking again does not buy the same answer
  // twice. The two answers are combined in `result-verification/agreement.ts`.
  verify_result: { iterates: false, calls: 2, taskKinds: VERIFICATION_TASK_KINDS }
});

/** Whether a purpose may make more than one call. Never how many. */
export function automationStudioLlmExecutionGrantIterates(purpose: AutomationStudioLlmExecutionGrantPurpose): boolean {
  return GRANT_CAPABILITIES[purpose].iterates;
}

/** The fixed call allowance of a purpose that does not iterate: one, or two for `verify_result`. */
export function automationStudioLlmExecutionGrantFixedCalls(purpose: AutomationStudioLlmExecutionGrantPurpose): number {
  return GRANT_CAPABILITIES[purpose].calls ?? 1;
}

/** The task kinds this purpose authorizes, for a caller that has to narrow them
 * further for its own entry point. */
export function automationStudioLlmExecutionGrantTaskKinds(purpose: AutomationStudioLlmExecutionGrantPurpose): readonly AutomationStudioLlmTaskKind[] {
  return [...new Set(GRANT_CAPABILITIES[parseAutomationStudioLlmExecutionGrantPurpose(purpose)].taskKinds.map((allowance) => allowance.taskKind))];
}

/** Whether a request is one the grant authorizes: its task, its scope, and limits no wider than the grant's. */
export function automationStudioLlmRequestMatchesGrant(request: AutomationStudioLlmTaskRequest, grant: AutomationStudioLlmGrantRequestBounds, policy: AutomationStudioLlmExecutionGrantResolvePolicy): boolean {
  if (policy.allowedTaskKinds && !policy.allowedTaskKinds.includes(request.taskKind)) return false;
  const capability = GRANT_CAPABILITIES[grant.purpose];
  if (!capability) return false;
  const taskAllowed = capability.taskKinds.some((allowance) => allowance.taskKind === request.taskKind && allowance.expectedOutput === request.expectedOutput);
  return taskAllowed
    && request.context.projectId === grant.projectId
    && request.context.flowId === grant.flowId
    && Number.isInteger(request.timeoutMs) && request.timeoutMs > 0 && request.timeoutMs <= grant.timeoutMs
    && Number.isFinite(request.maxEstimatedCostUsd) && request.maxEstimatedCostUsd > 0 && request.maxEstimatedCostUsd <= grant.maxEstimatedCostUsd
    && request.tokenLimits.maxInputTokens <= grant.tokenLimits.maxInputTokens
    && request.tokenLimits.maxOutputTokens <= grant.tokenLimits.maxOutputTokens
    && request.tokenLimits.maxTotalTokens <= grant.tokenLimits.maxTotalTokens;
}
