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
//
// **It keeps what the domain returned, for the patch.** An exploration exists
// to find what the failure record could not show -- a control behind a
// disclosure, a page one step on -- and the patch that follows used to be
// shown the failure packet alone, so a control only the exploration revealed
// could not be named in the repair. The packets the bound domain's own options
// returned, and the loop accepted, come back beside the exploration, each
// labelled so a handle taken from it can say which packet it came from.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowScope
} from "../../../model/index.ts";
import {
  automationStudioExploredEvidenceLabel,
  automationStudioHarnessOptionRegistry,
  automationStudioLlmProviderFailureSpendsCall,
  runAutomationStudioLlmHarness,
  type AutomationStudioHarnessOptionLoopBinding,
  type AutomationStudioLlmEvidenceLoopInput,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmEvidenceTool,
  type AutomationStudioLlmEvidenceToolExecutionResult,
  type AutomationStudioLlmHarnessInput,
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
import {
  reviewAutomationStudioExplorationReduction,
  type AutomationStudioExplorationReductionReview,
  type AutomationStudioExplorationStateDigestRequest
} from "../exploration-state/index.ts";
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

/** One packet an exploration returned, labelled for the runtime patch request. */
export type AutomationStudioRecoveryExploredPacket = NonNullable<AutomationStudioLlmHarnessInput["explorationEvidence"]>["packets"][number];

export type AutomationStudioRecoveryExplorationResult = {
  exploration: AutomationStudioRuntimeExploration;
  /**
   * The packets the bound domain's own options returned and the loop
   * accepted, oldest first, each labelled by its position through
   * `automationStudioExploredEvidenceLabel`. Empty when it returned none.
   * Whatever the outcome: a page seen before a limit ended the exploration was
   * still seen. Unbounded here; the patch request bounds what it carries.
   */
  explored: AutomationStudioRecoveryExploredPacket[];
  /**
   * What the exploration reduces to: the shortest sequence that still reaches
   * the state the success was observed in, the states that bound it, a receipt
   * for every step left out, and Core's verdict on whether it may be replayed.
   *
   * Present only when the exploration gathered evidence, because a reduction is
   * the path that *worked* and nothing worked in the other endings. A reduction
   * whose `replayable` is false is a receipt, not a fix; the sentence beside it
   * says which of the three things went wrong.
   */
  reduced?: AutomationStudioExplorationReductionReview;
};

// The label and the qualified-handle reader are defined once, beside the packet
// builder in `runtime/llm/harness`, which carries only packets labelled that
// way. The reader is re-exported here, where the target check has always
// imported it from; it is the same binding, not a copy.
export { automationStudioExploredEvidenceHandle } from "../../llm/index.ts";

/** One bounded exploration on the recovery path, ending in one named outcome. */
export async function runAutomationStudioRecoveryExploration(
  input: AutomationStudioRecoveryExplorationInput
): Promise<AutomationStudioRecoveryExplorationResult> {
  const binding = explorationRegistryBinding(input.binding);
  const registryLoop = automationStudioHarnessOptionRegistry({ binding }).evidenceLoopBinding(
    { projectId: input.context.projectId, flowId: input.context.flowId, runId: input.context.runId },
    { scope: input.scope, stage: "gather", policy: input.policy }
  );
  // Only the bound domain's own options issue packets whose handles its target
  // check can resolve. Core's neutral options may return evidence too; it is
  // not a page, and carrying it to the patch would cost bytes and name nothing.
  const domainToolIds = new Set(binding.tools.map((tool) => tool.toolId));
  if (binding.harnessOptions) for (const option of binding.harnessOptions.options) domainToolIds.add(option.toolId);
  const returned: Array<{ callId: string; toolId: string; packet: JsonObject }> = [];
  const loop: AutomationStudioHarnessOptionLoopBinding = {
    tools: registryLoop.tools,
    executeTool: async (call) => {
      const execution = await registryLoop.executeTool(call);
      const packet = domainToolIds.has(call.toolId) ? returnedPacket(execution) : undefined;
      if (packet) returned.push({ callId: call.callId, toolId: call.toolId, packet });
      return execution;
    }
  };
  // The exploration is billed to the run's own LLM budget, beside the diagnosis
  // and the patch, because it is model spend on this run. That budget is bounded
  // by tokens and money, not by a small call count -- a two-call run is what
  // once ended every real exploration in `budget_exhausted` before it looked at
  // anything -- and the exploration's own ledger adds the clock and the
  // no-progress guard. When the run budget refuses the next decision, the
  // refusal is what ended the exploration, and it is kept so the ending can be
  // named as tokens or as money rather than as a fault.
  let runBudgetRefusal: AutomationStudioLlmRunBudgetDiagnostic["code"] | undefined;
  const capture = input.binding.captureStateDigest?.bind(input.binding);
  const stateDigest = capture === undefined ? undefined : (request: AutomationStudioExplorationStateDigestRequest) => capture({
    projectId: input.context.projectId,
    flowId: input.context.flowId,
    callId: request.callId,
    toolId: request.toolId,
    phase: request.phase,
    ...(request.signal ? { signal: request.signal } : {})
  });
  const exploration = await runAutomationStudioRuntimeExploration({
    loop,
    decide: (decision) => explorationDecision(input, decision, (code) => { runBudgetRefusal ??= code; }),
    budget: input.budget ?? resolveAutomationStudioExplorationBudget(),
    recoveryDeadline: input.recoveryDeadline,
    completionSchema: AUTOMATION_STUDIO_RECOVERY_EXPLORATION_COMPLETION_SCHEMA,
    ...(input.binding.classifyRefusal ? { classifyRefusal: input.binding.classifyRefusal } : {}),
    // The digests come from here because here is the only place that holds both
    // the domain that can observe its own state and the project and Flow the
    // observation belongs to. The runner asks for a moment; this adds the
    // context and passes the question straight to the domain, so there is one
    // record of the exploration rather than the runner's and the caller's.
    ...(stateDigest ? { captureStateDigest: stateDigest } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.now ? { now: input.now } : {})
  });
  // `failed` is the loop saying it could not be driven, which is what a refused
  // decision looks like from inside it. Here the reason is known and it is a
  // limit, not a fault, so it is renamed -- and only here, because the
  // exploration's own ledger always outranks this: a wall clock or an action cap
  // that fired first leaves an outcome that is not `failed` and is left alone.
  const ended = !runBudgetRefusal || exploration.outcome !== "failed" ? exploration : {
    ...exploration,
    outcome: AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_RUN_BUDGET[runBudgetRefusal],
    reason: "The run's own LLM budget could not pay for the next exploration decision, so the exploration stopped.",
    endedBy: runBudgetRefusal
  };
  // The loop records an accepted step with its call id and the bytes it
  // carried; a step it refused -- too large, a repeat -- has neither, and its
  // packet was never evidence.
  const accepted = new Set(ended.trace.flatMap((step) => step.decision === "tool_call" && step.callId !== undefined && step.evidenceBytes !== undefined ? [step.callId] : []));
  const explored = returned
    .filter((entry) => accepted.has(entry.callId))
    .map((entry, index) => ({ evidenceId: automationStudioExploredEvidenceLabel(index + 1), toolId: entry.toolId, packet: entry.packet }));
  return { exploration: ended, explored, ...(reduced(input, ended, registryLoop.tools) ?? {}) };
}

/**
 * The exploration reduced to the path that worked, or nothing.
 *
 * Only `evidence_gathered` is reduced, and that is the whole gate: a reduction
 * is the shortest sequence that reaches the state *success was observed in*, so
 * an exploration that was stopped, refused or came back empty has no such state
 * and reducing it would answer with a fix for a success that never happened.
 *
 * The verdict is read, never assumed. `reviewAutomationStudioExplorationReduction`
 * refuses a reduction whose chain of states has a hole in it -- which is also
 * how an action that mutates while its tool table declares it observing shows
 * up, since an undeclared effect defaults to `observe` and such a step is
 * dropped from every reduction -- and a caller that ignored the flag would
 * publish a sequence that is missing the step the success depended on.
 */
function reduced(
  input: AutomationStudioRecoveryExplorationInput,
  exploration: AutomationStudioRuntimeExploration,
  tools: readonly AutomationStudioLlmEvidenceTool[]
): { reduced: AutomationStudioExplorationReductionReview } | undefined {
  if (exploration.outcome !== "evidence_gathered") return undefined;
  const classifyRefusal = input.binding.classifyRefusal;
  return {
    reduced: reviewAutomationStudioExplorationReduction({
      trace: exploration.trace,
      tools,
      steps: exploration.steps,
      observedState: exploration.observedState,
      digestFailures: exploration.stateDigestFailures,
      // The domain declares once how it reads its own result codes, and a code
      // it reads as a refusal is a step that did not happen. Asking it for a
      // second, differently-worded table would be two declarations of one fact.
      ...(classifyRefusal ? { classifyOutcome: (resultCode: string) => (classifyRefusal(resultCode) ? "refused" as const : undefined) } : {})
    })
  };
}

/**
 * The binding the recovery's registry is built from: the domain's declared
 * options alone, when it declares any.
 *
 * A domain's plain `tools` are the set it authored a Flow with. They carry no
 * stage of their own, and the registry offers an unpinned option at every
 * stage, so they were offered to a recovery at `gather` beside the options the
 * domain had pinned there. Two things follow, and the second is the serious
 * one. The design's "detection is not offered during a recovery" was not
 * literally true; and an authoring tool binds its targets through the
 * *authoring* packet map, so a handle the model took from a `recovery` packet
 * could resolve against an older authoring packet of the same Flow whenever
 * the location and the selector still matched. Their descriptions also cost
 * input bytes on every decision the recovery pays for.
 *
 * So a domain that declares recovery options explores with exactly those. A
 * domain that binds only the plain slot has nothing else to explore with and
 * keeps them, which is the whole of what a tools-only host had before.
 *
 * Written field by field rather than spread from the binding: a host may bind
 * an object whose `executeTool` is a prototype method, and a spread would hand
 * the registry a copy without it. Only the fields the registry reads are
 * carried; the exploration reads `classifyRefusal` and `deniedEvidenceKeys`
 * from the binding the caller passed, never from this view.
 */
function explorationRegistryBinding(binding: AutomationStudioLlmEvidenceRuntimeBinding): AutomationStudioLlmEvidenceRuntimeBinding {
  if (!binding.harnessOptions?.options.length) return binding;
  return {
    domainId: binding.domainId,
    deniedEvidenceKeys: binding.deniedEvidenceKeys,
    tools: [],
    harnessOptions: binding.harnessOptions,
    executeTool: (call) => binding.executeTool(call)
  };
}

/** The packet an option returned, when what it returned is one: a JSON object that names its schema. */
function returnedPacket(execution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): JsonObject | undefined {
  const evidence: unknown = isRecord(execution) && execution.kind === "llm_evidence_tool_execution" ? execution.evidence : execution;
  return isRecord(evidence) && typeof evidence.schemaVersion === "string" ? evidence as JsonObject : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    // Forwarded as declared, never defaulted: every decision after the first
    // carries what the domain's options returned, and the packet builder holds
    // that to these keys, refusing the decision when one is present.
    deniedEvidenceKeys: input.binding.deniedEvidenceKeys,
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
