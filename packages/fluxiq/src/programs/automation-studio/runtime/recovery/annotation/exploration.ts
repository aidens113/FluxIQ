// The recovery path's call into the bounded exploration runner.
//
// Phase 2.3 built the runner, the budget, the outcomes and the whole-recovery
// clock, and nothing called any of it: a plan could say `explorationRequested`
// and the run went straight from the diagnosis to the patch, so the trace's
// `exploration` stage was permanently `skipped` and every failure that needed a
// look at the live environment was answered from the failure record alone.
//
// This is the caller. It does three things the runner deliberately does not do
// for itself, because each one is a decision about *this* entry point rather
// than about exploring in general.
//
// **It builds the loop binding from the bound domain, at `stage: "gather"`.**
// The registry withholds a stage-pinned option from a call that names no stage,
// and the domain's recovery options are pinned to `gather` and `iterate`, so
// naming the stage here is what makes them reachable during a recovery and
// unreachable while a Flow is being authored.
//
// **It passes the adaptation policy, and never `allowSideEffectsWithoutPolicy`.**
// A runtime recovery always has a policy. Where a policy governs the call the
// policy is authoritative, so a mutating option appears exactly when
// `policy.allowExternalSideEffects` is true, and the caller's own opt-in -- the
// thing Flow authoring needs because nothing governs it there -- has no
// business being reachable from here at all.
//
// **It turns one provider call into one loop decision.** That is the piece the
// runtime path never had: the Flow-bootstrap path has had this shape since
// evidence-guided bootstrap landed, and the runtime path had no equivalent, so
// `decide` was a parameter with no argument anyone could pass.

import type { JsonObject } from "../../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowScope
} from "../../../model/index.ts";
import {
  automationStudioHarnessOptionRegistry,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmEvidenceLoopInput,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmRunBudgetDiagnostic,
  type AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioLlmTokenLimits
} from "../../llm/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../context.ts";
import { resolveAutomationStudioExplorationBudget, type AutomationStudioExplorationBudget } from "../exploration-budget.ts";
import { AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET } from "../exploration-outcome.ts";
import type { AutomationStudioRecoveryDeadline } from "../recovery-deadline.ts";
import { runAutomationStudioRuntimeExploration, type AutomationStudioRuntimeExploration } from "../runtime-exploration.ts";

/**
 * What an exploration is allowed to complete with.
 *
 * Deliberately narrow, and deliberately not a repair. An exploration answers
 * "what is actually true out there"; deciding what to change about the Flow is
 * the patch stage's work, and a completion schema that accepted a patch here
 * would let the model skip the stage that is answerable to a policy.
 */
export const AUTOMATION_STUDIO_RECOVERY_EXPLORATION_COMPLETION_SCHEMA: JsonObject = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "string",
      maxLength: 2_000,
      description: "What the evidence gathered actually shows about why the action failed. State only what an action returned."
    },
    unresolved: {
      type: "string",
      maxLength: 1_000,
      description: "What could not be established, when something could not be. Absent means everything asked was answered."
    }
  }
});

export type AutomationStudioRecoveryExplorationInput = {
  /** The bound domain, whose options and refusal vocabulary the exploration uses. */
  binding: AutomationStudioLlmEvidenceRuntimeBinding;
  /** Where the Flow is authored. Decides which options the registry will offer. */
  scope: AutomationStudioFlowScope;
  /** Authoritative over side effects. There is no path here that bypasses it. */
  policy: AutomationStudioAdaptationPolicy;
  provider: AutomationStudioLlmProvider;
  context: { projectId: string; flowId: string; runId: string; subflowId?: string; nodeId?: string };
  instructions: AutomationStudioFlowInstruction[];
  runDetail: AutomationStudioFlowRunDetail;
  recoveryContext: AutomationStudioRuntimeRecoveryContext;
  failureEvidence?: JsonObject;
  reusableContext?: AutomationStudioReusableLlmContextPacket;
  /** The run's ledger. Exploration decisions draw on its exploration call
   * allowance, and on the same global token and cost ceilings as every other
   * call the run makes. */
  runBudget: AutomationStudioLlmRunBudgetLedger;
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits>;
  timeoutMs?: number;
  maxEstimatedCostUsd: number;
  /** The whole recovery's clock, started once by the caller above this one. */
  recoveryDeadline: AutomationStudioRecoveryDeadline;
  budget?: AutomationStudioExplorationBudget;
  signal?: AbortSignal;
  now?: () => number;
};

/** One bounded exploration on the recovery path, ending in one named outcome. */
export async function runAutomationStudioRecoveryExploration(
  input: AutomationStudioRecoveryExplorationInput
): Promise<AutomationStudioRuntimeExploration> {
  const loop = automationStudioHarnessOptionRegistry({ binding: input.binding }).evidenceLoopBinding(
    { projectId: input.context.projectId, flowId: input.context.flowId, runId: input.context.runId },
    { scope: input.scope, stage: "gather", policy: input.policy }
  );
  // The exploration is billed to the run's own LLM budget, beside the diagnosis
  // and the patch, because it is model spend on this run -- but to that budget's
  // *exploration* call allowance, which is its own number. Borrowing from
  // `maxCallsPerRun` is what made this stage useless in practice: the diagnosis
  // and the patch spent both of a default run's two calls, so a real recovery
  // ended its exploration in `budget_exhausted` before it looked at anything.
  // The token and cost ceilings are still the run's single global ones. When
  // the budget refuses the next decision, the refusal is what ended the
  // exploration, and it is kept so the ending can be named.
  let runBudgetRefusal: AutomationStudioLlmRunBudgetDiagnostic["code"] | undefined;
  const exploration = await runAutomationStudioRuntimeExploration({
    loop,
    decide: (decision) => explorationDecision(input, decision, (code) => { runBudgetRefusal ??= code; }),
    budget: input.budget ?? resolveAutomationStudioExplorationBudget(),
    recoveryDeadline: input.recoveryDeadline,
    completionSchema: AUTOMATION_STUDIO_RECOVERY_EXPLORATION_COMPLETION_SCHEMA,
    ...(input.binding.classifyRefusal ? { classifyRefusal: input.binding.classifyRefusal } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.now ? { now: input.now } : {})
  });
  // `failed` is the loop saying it could not be driven, which is what a refused
  // decision looks like from inside it. Here the reason is known and it is a
  // limit, not a fault, so it is renamed -- and only here, because the
  // exploration's own ledger always outranks this: a wall clock or an action cap
  // that fired first leaves an outcome that is not `failed` and is left alone.
  if (!runBudgetRefusal || exploration.outcome !== "failed") return exploration;
  return {
    ...exploration,
    outcome: AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET[runBudgetRefusal],
    reason: "The run's own LLM budget could not pay for the next exploration decision, so the exploration stopped.",
    endedBy: runBudgetRefusal
  };
}

/**
 * One provider call, answered as one evidence-loop decision.
 *
 * A call that does not come back as a decision throws rather than returning
 * something empty. The loop turns that into a failure code and the runner
 * classifies it, so "the provider would not answer" ends as `failed` -- not as
 * an exploration that ran and found nothing, which is the collapse the whole
 * outcome vocabulary exists to prevent.
 */
async function explorationDecision(
  input: AutomationStudioRecoveryExplorationInput,
  decision: Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0],
  onRunBudgetRefusal: (code: AutomationStudioLlmRunBudgetDiagnostic["code"]) => void
): Promise<unknown> {
  const result = await runAutomationStudioLlmHarness({
    taskKind: "evidence_tool_decision",
    stage: "gather",
    projectId: input.context.projectId,
    flowId: input.context.flowId,
    runId: input.context.runId,
    ...(input.context.subflowId ? { subflowId: input.context.subflowId } : {}),
    ...(input.context.nodeId ? { nodeId: input.context.nodeId } : {}),
    instructions: input.instructions,
    runDetail: input.runDetail,
    recoveryContext: input.recoveryContext,
    ...(input.failureEvidence ? { failureEvidence: input.failureEvidence } : {}),
    ...(input.binding.deniedEvidenceKeys ? { deniedEvidenceKeys: input.binding.deniedEvidenceKeys } : {}),
    ...(input.reusableContext ? { reusableContext: input.reusableContext } : {}),
    evidenceLoop: {
      iteration: decision.iteration,
      tools: decision.tools,
      evidence: decision.evidence.map((item) => ({ ...item })),
      decisionSchema: decision.decisionSchema,
      completionSchema: AUTOMATION_STUDIO_RECOVERY_EXPLORATION_COMPLETION_SCHEMA,
      canComplete: decision.canComplete
    },
    policy: input.policy,
    provider: input.provider,
    runBudget: input.runBudget,
    // Declared, not inferred. The ledger reads an undeclared reservation as an
    // ordinary run call, so this line is the whole of what makes an exploration
    // decision draw on the exploration allowance instead of on the diagnosis
    // and patch pair's.
    runBudgetAllowance: "exploration",
    ...(input.tokenLimits ? { tokenLimits: input.tokenLimits } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    maxEstimatedCostUsd: input.maxEstimatedCostUsd,
    expectedOutput: "evidence_tool_decision",
    ...(decision.signal ? { signal: decision.signal } : {}),
    ...(input.now ? { now: input.now } : {}),
    metadata: { source: "runRuntimeSession", expectedOutput: "evidence_tool_decision" }
  });
  if (!result.ok || result.response?.kind !== "evidence_tool_decision") {
    const refusal = result.diagnostics
      .map((diagnostic) => diagnostic.code)
      .find((code): code is AutomationStudioLlmRunBudgetDiagnostic["code"] => code in AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET);
    if (refusal) onRunBudgetRefusal(refusal);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code).join(", ");
    throw new Error(`The exploration decision call did not return a decision${codes ? `: ${codes}` : "."}`);
  }
  return { ...result.response.decision, ...(result.usage ? { usage: result.usage } : {}) };
}
