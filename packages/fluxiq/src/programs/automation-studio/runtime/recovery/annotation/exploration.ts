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
  automationStudioLlmProviderFailureSpendsCall,
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmEvidenceLoopInput,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmRunBudgetDiagnostic,
  type AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioLlmTaskResult,
  type AutomationStudioLlmTokenLimits
} from "../../llm/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../context.ts";
import { resolveAutomationStudioExplorationBudget, type AutomationStudioExplorationBudget } from "../exploration-budget.ts";
import { AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET } from "../exploration-outcome.ts";
import type { AutomationStudioRecoveryDeadline } from "../recovery-deadline.ts";
import { runAutomationStudioRuntimeExploration, type AutomationStudioRuntimeExploration } from "../runtime-exploration.ts";
import { AutomationStudioExplorationUnusableDecisionError } from "../unusable-decision.ts";

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
  reusableContext?: AutomationStudioReusableLlmContextPacket;
  /** The run's ledger. Exploration decisions are paid from the same token and
   * cost ceilings as every other call the run makes, and are labelled on its
   * receipt so what exploring cost stays visible. */
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
  // and the patch, because it is model spend on this run. That budget is bounded
  // by tokens and money, not by a small call count -- a two-call run is what
  // once ended every real exploration in `budget_exhausted` before it looked at
  // anything -- and the exploration's own ledger adds the clock and the
  // no-progress guard. When the run budget refuses the next decision, the
  // refusal is what ended the exploration, and it is kept so the ending can be
  // named as tokens or as money rather than as a fault.
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
 * something empty. Which error says what happened. A call that was made and
 * paid for and answered with something unusable -- or timed out, or met a
 * provider that was briefly unavailable -- throws the unusable-decision error,
 * and the runner asks again under the progress guard. Anything else ends the
 * loop, which the runner classifies, so "the provider would not answer" ends as
 * `failed` -- not as an exploration that ran and found nothing, which is the
 * collapse the whole outcome vocabulary exists to prevent.
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
    // No `failureEvidence`, on purpose. Core admits a captured failure snapshot
    // to the diagnosis and the patch only, and refuses it on any other task
    // before a provider is called -- so carrying it here refused every
    // exploration decision whenever the domain captured one, which the web
    // domain always does. The diagnosis has already read it; the exploration's
    // job is to gather fresh evidence of its own.
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
    // ordinary run call, so this line is what puts an exploration decision on
    // the receipt as one. It is a label; it draws on the same purse.
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
    if (spentWithoutDecision(result)) throw new AutomationStudioExplorationUnusableDecisionError(result.diagnostics.map((diagnostic) => diagnostic.code));
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code).join(", ");
    throw new Error(`The exploration decision call did not return a decision${codes ? `: ${codes}` : "."}`);
  }
  return { ...result.response.decision, ...(result.usage ? { usage: result.usage } : {}) };
}

/**
 * Whether a failed decision call reached the provider and failed only on the
 * provider's side, in a way another attempt could fix.
 *
 * Closed, and it fails closed. Every error the call ended with must be one of
 * two things: a provider failure whose disposition is a spent call (the same
 * table the execution grant reads, so a failure the grant survives is exactly
 * a failure worth asking again), or a finding in `llm_output.`, the harness's
 * own namespace for a reply that arrived and did not pass Core's checks. An
 * `ok` result whose response was some other kind is the same thing. Anything
 * else -- a refused budget, a pre-flight refusal, a usage breach, a conflicting
 * instruction, a failure with no provider code -- is not asked again.
 */
function spentWithoutDecision(result: AutomationStudioLlmTaskResult): boolean {
  if (!result.provider) return false;
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .every((diagnostic) => diagnostic.code.startsWith("llm_output.") || automationStudioLlmProviderFailureSpendsCall({
      code: diagnostic.code,
      status: providerStatus(diagnostic.metadata)
    }));
}

function providerStatus(metadata: unknown): number | undefined {
  const status = metadata && typeof metadata === "object" ? (metadata as { providerStatus?: unknown }).providerStatus : undefined;
  return typeof status === "number" ? status : undefined;
}
