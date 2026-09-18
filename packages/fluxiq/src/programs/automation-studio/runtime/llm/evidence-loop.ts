import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS } from "../loop-limits/index.ts";
import type { AutomationStudioLlmUsageSummary } from "./harness.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AutomationStudioLlmUnusableDecisionError,
  automationStudioLlmUnusableDecisionFeedback,
  automationStudioLlmUnusableDecisionIssueSet
} from "./unusable-decision.ts";

// The ceilings are held in runtime/loop-limits/ because runtime/recovery/ is
// bounded by the same three numbers, and a constant both directories read is
// how an import edge grows between them. Re-exported here so the loop's public
// surface is unchanged: every existing consumer still reads it from
// runtime/llm/.
export { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS };
// The error a decision callback throws to have the loop ask again, and how a
// caller tells whether a failed call is that kind of failure. Part of the
// loop's input contract, so published with it.
export {
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID,
  AutomationStudioLlmUnusableDecisionError,
  automationStudioLlmTaskResultSpentWithoutDecision,
  automationStudioLlmUnusableDecisionError
} from "./unusable-decision.ts";

/** Provider-neutral decision policy for bounded evidence loops. Provider adapters
 * should include this policy in their structured-decision instruction.
 *
 * The last two sentences were added after a live creation campaign in which
 * every built Flow only read and none acted. The policy already said, rightly,
 * never to mutate merely to perform a step that belongs in the generated
 * result; nothing said the converse, that a refusal here is not a refusal
 * there. Offered only tools that decline to act, and refused when it asked one
 * to, the model read the whole exercise as "acting is unavailable" and wrote
 * the only shape it had seen accepted. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION = "Evidence entries are the current authoritative results of prior tool calls. Your goal is to produce the final structured result, not to execute the workflow that result describes. When the decision schema offers a complete variant, evaluate it first. Complete immediately once current evidence is sufficient to construct that result. Do not select a tool merely because one remains available. Use a tool only to resolve information still missing from the result; prefer observation over mutation. Use a mutating tool only when its state change is necessary to reveal otherwise unavailable evidence, such as moving to where that evidence is kept or revealing what is hidden. Never mutate merely to perform an eventual workflow step that belongs in the generated result, and never repeat a successful mutation merely to try another eventual-workflow value. Never repeat the same toolId with the same input. Repeating an observation with different parameters is not progress. Do not call a mutating tool merely to unlock another observation. Treat a recoverable tool result shaped like {ok:false,code:string} as feedback and choose a different evidence-gathering action or complete if enough evidence is already available. An entry whose toolId starts with core. is Core's answer to your previous decision, not a tool result: correct what it names, and when it names an earlier callId, use that entry instead of asking again. A tool that refused you, or was never offered, bounds only what you may do while gathering evidence, never what the result may contain: write the step you were not permitted to perform here into the result instead, from what you observed.";

/**
 * Unusable decisions in a row, however much their issues differ, after which a
 * loop that asks again stops: the far backstop under the no-progress guard. A
 * model fixing one mistake at a time is progress, so this is set well past the
 * handful of refusals a real correction takes; the cost, token and deadline
 * guards still bind underneath it. Held to the loop's own iterations.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW = 12;

/** The evidence entry the loop's answer to a repeated request arrives under. */
const REQUEST_CHECK_TOOL_ID = "core.request_check";

/** What a request the loop answered itself, rather than running, is recorded as. */
const ANSWERED_REQUEST = {
  "llm_evidence_loop.already_answered": "This exact request was already answered and nothing has changed since, so it was not run again. Its result is the evidence entry named by answeredByCallId, placed just before this one. Use it, or choose a different tool or input, or complete.",
  "llm_evidence_loop.already_observed": "This observation was already made and no action has changed anything since, so it was not run again. Its latest result is the evidence entry named by answeredByCallId, placed just before this one. Use it, change something first, or complete."
} as const;

type AnsweredRequestCode = keyof typeof ANSWERED_REQUEST;

export type AutomationStudioLlmEvidenceTool = {
  toolId: string;
  description: string;
  inputSchema: JsonObject;
  effect?: "observe" | "mutate";
  repeatPolicy?: "after_mutation";
  /** Optional domain-declared observation that is safe to run before the first
   * provider decision. The coordinator executes at most one such declaration. */
  initialObservation?: { input: JsonObject };
};

export type AutomationStudioLlmEvidenceLoopDecision =
  | { kind: "tool_call"; callId: string; toolId: string; input: JsonObject; usage?: AutomationStudioLlmUsageSummary }
  | { kind: "complete"; result: JsonObject; usage?: AutomationStudioLlmUsageSummary };

export type AutomationStudioLlmEvidenceLoopTrace = {
  iteration: number;
  /** `unusable` is a decision call that was made and came back as nothing the
   * loop could act on, and was asked again. It names no tool. */
  decision: "tool_call" | "complete" | "unusable";
  callId?: string;
  toolId?: string;
  evidenceBytes?: number;
  effectApplied?: boolean;
  resultCode?: string;
  usage?: AutomationStudioLlmUsageSummary;
};

export type AutomationStudioLlmEvidenceToolExecutionResult = {
  kind: "llm_evidence_tool_execution";
  evidence: JsonValue;
  effectApplied: boolean;
  resultCode?: string;
};

/**
 * What a caller's check made of a completed result. A refusal names why, in
 * issue codes, and carries the feedback the model is shown before it is asked
 * again: bounded JSON the caller authored -- what was wrong and where -- never
 * content the model has not already seen from its own tools.
 */
export type AutomationStudioLlmEvidenceCompletionCheck =
  | { ok: true }
  | { ok: false; issueCodes: readonly string[]; feedback: JsonObject };

/** The evidence entry a refused completion's feedback arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID = "core.completion_check";

export type AutomationStudioLlmEvidenceLoopFailureCode =
  | "llm_evidence_loop.invalid_configuration"
  | "llm_evidence_loop.invalid_decision"
  | "llm_evidence_loop.unknown_tool"
  // These two are no longer produced. A reused call id is replaced with one the
  // loop assigns, and a repeated request is answered, a run of them ending the
  // loop as `repeat_without_progress`. Kept because the outcome tables callers
  // key by this union still name them, and a stored result may carry them.
  | "llm_evidence_loop.duplicate_call"
  | "llm_evidence_loop.duplicate_tool_request"
  /** The no-progress guard tripped: the loop kept repeating itself. */
  | "llm_evidence_loop.repeat_without_progress"
  | "llm_evidence_loop.tool_failed"
  | "llm_evidence_loop.evidence_limit"
  | "llm_evidence_loop.iteration_limit"
  | "llm_evidence_loop.cancelled";

export type AutomationStudioLlmEvidenceLoopResult =
  | {
    ok: true;
    result: JsonObject;
    trace: AutomationStudioLlmEvidenceLoopTrace[];
    accounting: AutomationStudioLlmEvidenceLoopAccounting;
  }
  | {
    ok: false;
    code: AutomationStudioLlmEvidenceLoopFailureCode;
    trace: AutomationStudioLlmEvidenceLoopTrace[];
    accounting: AutomationStudioLlmEvidenceLoopAccounting;
  };

export type AutomationStudioLlmEvidenceLoopAccounting = {
  iterations: number;
  toolCalls: number;
  evidenceBytes: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type AutomationStudioLlmEvidenceLoopInput = {
  tools: AutomationStudioLlmEvidenceTool[];
  decide(input: {
    iteration: number;
    tools: AutomationStudioLlmEvidenceTool[];
    evidence: ReadonlyArray<{ callId: string; toolId: string; value: JsonValue }>;
    decisionSchema: JsonObject;
    canComplete: boolean;
    signal?: AbortSignal;
  }): Promise<unknown>;
  executeTool(input: { callId: string; toolId: string; value: JsonObject; maxEvidenceBytes: number; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  maxIterations?: number;
  maxToolCalls?: number;
  maxEvidenceBytes?: number;
  maxEvidenceContextBytes?: number;
  completionSchema?: JsonObject;
  minToolCalls?: number;
  propagateDecisionErrors?: boolean;
  /**
   * The no-progress guard: how many steps in a row may give the loop nothing
   * new before it ends.
   *
   * A step gives nothing new when it asks for a tool request already answered
   * with nothing changed since, when it asks to repeat an observation no action
   * has changed, or when it is an unusable decision refused for a set of issues
   * already seen since the last tool result. The loop answers the first two
   * itself -- the earlier result is placed at the end of the evidence with a
   * note naming it, and the tool is not run -- and tells the model about the
   * third. A tool that runs resets the count. An unusable decision refused for
   * issues not seen since then is new: the count starts again at one.
   *
   * The step that reaches the guard ends the loop: a repeated request as
   * `llm_evidence_loop.repeat_without_progress`, an unusable decision through
   * `unusableDecisions.stalled`.
   *
   * Absent, `unusableDecisions.maxConsecutive` when that is set, otherwise
   * three, held to `maxIterations`. Given both, they must agree.
   */
  maxStepsWithoutProgress?: number;
  /**
   * Ask again after an unusable decision instead of ending.
   *
   * When set, a `decide` that throws `AutomationStudioLlmUnusableDecisionError`
   * spends that iteration -- one provider call, so `maxIterations` still bounds
   * every call the loop makes -- is recorded as an `unusable` step, the model
   * is told the issue codes and the decision shape as evidence under
   * `AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID`, and the loop
   * asks again. Two things end it, and `stalled` builds the error that does,
   * which is then handled exactly as if `decide` had thrown it (thrown under
   * `propagateDecisionErrors`, otherwise `llm_evidence_loop.invalid_decision`):
   * an unusable decision that reaches the no-progress guard, and the
   * `maxInARow`-th unusable decision in a row however different their issues.
   * A usable decision resets the second count.
   *
   * Absent, the error is an ordinary decision error, as it always was. Any
   * other error `decide` throws is unaffected either way.
   *
   * A completed result that `checkCompletion` refuses is an unusable decision
   * too, and joins the same counts.
   */
  unusableDecisions?: {
    /** The no-progress guard's length, when `maxStepsWithoutProgress` is not given. */
    maxConsecutive?: number;
    /**
     * The far backstop: unusable decisions in a row that end the loop however
     * much their issues differ. At least the no-progress guard and at most
     * `maxIterations`; absent,
     * `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW`
     * held to those two.
     */
    maxInARow?: number;
    stalled(input: {
      issueCodes: readonly string[];
      trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
      accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting>;
    }): unknown;
  };
  /**
   * Check a completed result before the loop accepts it.
   *
   * A result the check refuses was a paid call that produced nothing usable.
   * With `unusableDecisions` set it is recorded as an `unusable` step, the
   * check's feedback is added to the evidence the model sees under
   * `AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID`, and the loop
   * asks again; without it, the loop ends `llm_evidence_loop.invalid_decision`.
   * A check that throws is a decision error. Its issue codes are what decide
   * whether the refusal is new: the feedback should name each issue and the
   * shape that is accepted, since it is all the model has to correct from.
   */
  checkCompletion?(result: JsonObject): AutomationStudioLlmEvidenceCompletionCheck | Promise<AutomationStudioLlmEvidenceCompletionCheck>;
  signal?: AbortSignal;
};

/**
 * Coordinates an allowlisted, bounded evidence-gathering loop. Provider grants,
 * request budgets, and final artifact validation remain authoritative in the
 * callbacks that already own those responsibilities.
 */
export async function runAutomationStudioLlmEvidenceLoop(
  input: AutomationStudioLlmEvidenceLoopInput
): Promise<AutomationStudioLlmEvidenceLoopResult> {
  const limits = resolveLimits(input);
  const trace: AutomationStudioLlmEvidenceLoopTrace[] = [];
  const accounting = emptyAccounting();
  if (!limits || !validTools(input.tools)) return failure("llm_evidence_loop.invalid_configuration", trace, accounting);
  const toolIds = new Set(input.tools.map((tool) => tool.toolId));
  const toolsById = new Map(input.tools.map((tool) => [tool.toolId, tool] as const));
  // Whether any mutation is reachable at all. Read once, because the offered
  // list does not change during a loop, and because it is what decides whether
  // a mutation-gated observation is gated or simply shut (see
  // `requiresMutationBeforeRepeat`).
  const mutableTools = input.tools.some((tool) => tool.effect === "mutate");
  const callIds = new Set<string>();
  // Each request that ran, by what it asked in which mutation epoch, and the
  // call that answered it.
  const answeredRequests = new Map<string, string>();
  const observationEpochs = new Map<string, number>();
  // The call that made each protected tool's latest observation.
  const latestObservations = new Map<string, string>();
  let mutationEpoch = 0;
  const evidence: Array<{ callId: string; toolId: string; value: JsonValue }> = [];
  const initialTool = input.tools.find((tool) => tool.initialObservation);
  if (initialTool) {
    const initialInput = initialTool.initialObservation!.input;
    if (input.signal?.aborted) return failure("llm_evidence_loop.cancelled", trace, accounting);
    const callId = `initial.${initialTool.toolId}`;
    let rawExecution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;
    try {
      rawExecution = await input.executeTool({ callId, toolId: initialTool.toolId, value: structuredClone(initialInput), maxEvidenceBytes: Math.max(1, Math.min(limits.maxEvidenceContextBytes - 512, limits.maxEvidenceBytes)), ...(input.signal ? { signal: input.signal } : {}) });
    } catch {
      return failure(input.signal?.aborted ? "llm_evidence_loop.cancelled" : "llm_evidence_loop.tool_failed", trace, accounting);
    }
    const execution = parseToolExecutionResult(rawExecution, initialTool.effect);
    if (!execution || !isJsonValue(execution.evidence)) return failure("llm_evidence_loop.tool_failed", trace, accounting);
    const evidenceBytes = Buffer.byteLength(JSON.stringify(execution.evidence), "utf8");
    if (evidenceBytes > limits.maxEvidenceBytes) return failure("llm_evidence_loop.evidence_limit", trace, accounting);
    accounting.toolCalls = 1;
    accounting.evidenceBytes = evidenceBytes;
    callIds.add(callId);
    answeredRequests.set(canonicalJson([mutationEpoch, initialTool.toolId, initialInput]), callId);
    observationEpochs.set(initialTool.toolId, mutationEpoch);
    latestObservations.set(initialTool.toolId, callId);
    evidence.push({ callId, toolId: initialTool.toolId, value: execution.evidence });
    trace.push({ iteration: 0, decision: "tool_call", callId, toolId: initialTool.toolId, evidenceBytes, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}) });
  }
  // The no-progress guard: steps in a row that gave the loop nothing new, and
  // the unusable issue sets seen since the last tool result.
  let stepsWithoutProgress = 0;
  const unusableIssueSets = new Set<string>();
  // The far backstop: unusable decisions in a row, however they differ.
  let unusableInARow = 0;
  const progressed = (): void => {
    stepsWithoutProgress = 0;
    unusableIssueSets.clear();
  };
  // Counts evidence the loop itself adds against the byte limit. Returns its
  // bytes, or nothing when it does not fit.
  const reserveEvidence = (value: JsonValue): number | undefined => {
    const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (accounting.evidenceBytes + bytes > limits.maxEvidenceBytes) return undefined;
    accounting.evidenceBytes += bytes;
    return bytes;
  };
  // One more unusable decision. Returns the error that ends the loop once a
  // guard is reached, or nothing when the loop should ask again.
  const unusable = (step: AutomationStudioLlmEvidenceLoopTrace, issueCodes: readonly string[]): { error: unknown } | undefined => {
    unusableInARow += 1;
    const issueSet = automationStudioLlmUnusableDecisionIssueSet(issueCodes);
    if (unusableIssueSets.has(issueSet)) stepsWithoutProgress += 1;
    else {
      unusableIssueSets.add(issueSet);
      stepsWithoutProgress = 1;
    }
    trace.push(step);
    if (stepsWithoutProgress < limits.maxStepsWithoutProgress && unusableInARow < limits.maxUnusableDecisionsInARow) return undefined;
    return { error: input.unusableDecisions!.stalled({ issueCodes, trace: [...trace], accounting: { ...accounting } }) };
  };
  // A request the loop answers itself: the tool is not run, the result that
  // already answers it is moved to the end of the evidence, where the model's
  // window always reaches, and a note naming it follows. Returns the result
  // that ends the loop, or nothing when it should ask again.
  const answerRequest = (
    iteration: number,
    decision: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }>,
    code: AnsweredRequestCode,
    answeredByCallId: string
  ): AutomationStudioLlmEvidenceLoopResult | undefined => {
    stepsWithoutProgress += 1;
    const step: AutomationStudioLlmEvidenceLoopTrace = { iteration, decision: "tool_call", toolId: decision.toolId, resultCode: code, ...(decision.usage ? { usage: decision.usage } : {}) };
    if (stepsWithoutProgress >= limits.maxStepsWithoutProgress) {
      trace.push({ ...step, resultCode: "llm_evidence_loop.rejected.repeat_without_progress" });
      return failure("llm_evidence_loop.repeat_without_progress", trace, accounting);
    }
    const note: JsonObject = {
      ok: false,
      code,
      toolId: decision.toolId,
      answeredByCallId,
      stepsWithoutProgress,
      maxStepsWithoutProgress: limits.maxStepsWithoutProgress,
      instruction: ANSWERED_REQUEST[code]
    };
    const noteBytes = reserveEvidence(note);
    if (noteBytes === undefined) {
      trace.push(step);
      return failure("llm_evidence_loop.evidence_limit", trace, accounting);
    }
    const earlier = evidence.findIndex((entry) => entry.callId === answeredByCallId);
    if (earlier >= 0) evidence.push(...evidence.splice(earlier, 1));
    evidence.push({ callId: `${REQUEST_CHECK_TOOL_ID}.${iteration}`, toolId: REQUEST_CHECK_TOOL_ID, value: note });
    trace.push({ ...step, evidenceBytes: noteBytes });
    return undefined;
  };
  for (let iteration = 1; iteration <= limits.maxIterations; iteration += 1) {
    if (input.signal?.aborted) return failure("llm_evidence_loop.cancelled", trace, accounting);
    accounting.iterations = iteration;
    let decision: AutomationStudioLlmEvidenceLoopDecision | undefined;
    const eligibleTools = input.tools.filter((tool) =>
      !requiresMutationBeforeRepeat(tool, mutableTools) || observationEpochs.get(tool.toolId) !== mutationEpoch
    );
    const eligibleToolIds = new Set(eligibleTools.map((tool) => tool.toolId));
    const canComplete = accounting.toolCalls >= limits.minToolCalls;
    if (!eligibleTools.length && !canComplete) return failure("llm_evidence_loop.repeat_without_progress", trace, accounting);
    try {
      const decisionSchema = buildAutomationStudioLlmEvidenceLoopDecisionSchema(eligibleTools, input.completionSchema, canComplete);
      decision = parseDecision(await input.decide({ iteration, tools: eligibleTools, evidence: evidenceContextWindow(evidence, limits.maxEvidenceContextBytes), decisionSchema, canComplete, ...(input.signal ? { signal: input.signal } : {}) }));
    } catch (thrown) {
      if (input.signal?.aborted) return failure("llm_evidence_loop.cancelled", trace, accounting);
      let error = thrown;
      if (input.unusableDecisions && thrown instanceof AutomationStudioLlmUnusableDecisionError) {
        const resultCode = thrown.issueCodes[0];
        const stalled = unusable({ iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}) }, thrown.issueCodes);
        if (!stalled) {
          // The model is told what was wrong, as evidence, before it is asked again.
          const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: thrown.issueCodes, stepsWithoutProgress, maxStepsWithoutProgress: limits.maxStepsWithoutProgress });
          if (reserveEvidence(feedback) === undefined) return failure("llm_evidence_loop.evidence_limit", trace, accounting);
          evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID, value: feedback });
          continue;
        }
        error = stalled.error;
      }
      if (input.propagateDecisionErrors) throw error;
    }
    if (!decision) return failure("llm_evidence_loop.invalid_decision", trace, accounting);
    addUsage(accounting, decision.usage);
    if (decision.kind === "complete") {
      if (accounting.toolCalls < limits.minToolCalls) return failure("llm_evidence_loop.invalid_decision", trace, accounting);
      let check: ReturnType<typeof parseCompletionCheck> = { ok: true };
      if (input.checkCompletion) {
        try {
          check = parseCompletionCheck(await input.checkCompletion(structuredClone(decision.result)));
        } catch (error) {
          if (input.signal?.aborted) return failure("llm_evidence_loop.cancelled", trace, accounting);
          if (input.propagateDecisionErrors) throw error;
          return failure("llm_evidence_loop.invalid_decision", trace, accounting);
        }
      }
      if (check?.ok) {
        trace.push({ iteration, decision: "complete", ...(decision.usage ? { usage: decision.usage } : {}) });
        return { ok: true, result: decision.result, trace, accounting };
      }
      if (!check || !input.unusableDecisions) return failure("llm_evidence_loop.invalid_decision", trace, accounting);
      // The model is told why, as evidence, before it is asked again.
      if (reserveEvidence(check.feedback) === undefined) return failure("llm_evidence_loop.evidence_limit", trace, accounting);
      evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID, value: check.feedback });
      const resultCode = check.issueCodes[0];
      const stalled = unusable({ iteration, decision: "unusable", ...(resultCode ? { resultCode } : {}), ...(decision.usage ? { usage: decision.usage } : {}) }, check.issueCodes);
      if (!stalled) continue;
      if (input.propagateDecisionErrors) throw stalled.error;
      return failure("llm_evidence_loop.invalid_decision", trace, accounting);
    }
    unusableInARow = 0;
    if (!toolIds.has(decision.toolId)) return failure("llm_evidence_loop.unknown_tool", trace, accounting);
    // A repeat is answered from what the loop already holds. Checked before the
    // call id, so a request repeated word for word is a repeat, not a clash.
    const toolRequestSignature = canonicalJson([mutationEpoch, decision.toolId, decision.input]);
    const answeredBy = answeredRequests.get(toolRequestSignature);
    // Not offered this iteration: an observation no applied action has changed.
    // Its latest call is always recorded with its epoch.
    const reobservation = !eligibleToolIds.has(decision.toolId);
    if (answeredBy !== undefined || reobservation) {
      const ended = answeredBy !== undefined
        ? answerRequest(iteration, decision, "llm_evidence_loop.already_answered", answeredBy)
        : answerRequest(iteration, decision, "llm_evidence_loop.already_observed", latestObservations.get(decision.toolId)!);
      if (ended) return ended;
      continue;
    }
    // A call id the model already used names a different request here, so the
    // loop gives it one of its own rather than ending: the ids are the model's
    // bookkeeping, and the evidence only needs them to be distinct.
    const callId = unusedCallId(callIds, decision.callId);
    const tool = toolsById.get(decision.toolId)!;
    if (accounting.toolCalls >= limits.maxToolCalls) return failure("llm_evidence_loop.iteration_limit", trace, accounting);
    callIds.add(callId);
    answeredRequests.set(toolRequestSignature, callId);
    let rawExecution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;
    try {
      rawExecution = await input.executeTool({ callId, toolId: decision.toolId, value: decision.input, maxEvidenceBytes: Math.max(1, Math.min(limits.maxEvidenceContextBytes - 512, limits.maxEvidenceBytes - accounting.evidenceBytes)), ...(input.signal ? { signal: input.signal } : {}) });
    } catch {
      return failure(input.signal?.aborted ? "llm_evidence_loop.cancelled" : "llm_evidence_loop.tool_failed", trace, accounting);
    }
    const execution = parseToolExecutionResult(rawExecution, tool.effect);
    if (!execution) return failure("llm_evidence_loop.tool_failed", trace, accounting);
    const { evidence: value, effectApplied, resultCode } = execution;
    if (!isJsonValue(value)) return failure("llm_evidence_loop.tool_failed", trace, accounting);
    const evidenceBytes = Buffer.byteLength(JSON.stringify(value), "utf8");
    if (accounting.evidenceBytes + evidenceBytes > limits.maxEvidenceBytes) return failure("llm_evidence_loop.evidence_limit", trace, accounting);
    accounting.toolCalls += 1;
    accounting.evidenceBytes += evidenceBytes;
    progressed();
    if (tool.effect === "mutate" && effectApplied) mutationEpoch += 1;
    if (requiresMutationBeforeRepeat(tool, mutableTools)) {
      observationEpochs.set(tool.toolId, mutationEpoch);
      latestObservations.set(tool.toolId, callId);
    }
    evidence.push({ callId, toolId: decision.toolId, value });
    trace.push({ iteration, decision: "tool_call", callId, toolId: decision.toolId, evidenceBytes, ...(tool.effect === "mutate" ? { effectApplied } : {}), ...(resultCode ? { resultCode } : {}), ...(decision.usage ? { usage: decision.usage } : {}) });
  }
  return failure("llm_evidence_loop.iteration_limit", trace, accounting);
}

/**
 * The requested call id when it is unused, otherwise the first of `<id>.2`,
 * `<id>.3`, ... that is, cut to keep within the 200-character id bound. The
 * suffix is digits and a dot, so the id stays one the provider schema accepts.
 */
function unusedCallId(used: ReadonlySet<string>, requested: string): string {
  if (!used.has(requested)) return requested;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `.${suffix}`;
    const candidate = `${requested.slice(0, 200 - tail.length)}${tail}`;
    if (!used.has(candidate)) return candidate;
  }
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Whether an observation must wait for a mutation before it may be made again.
 *
 * An initial observation is already the tool's observation for epoch zero, so
 * it is protected even when the domain omitted the redundant explicit repeat
 * policy, and allowed again only after an applied mutation.
 *
 * `mutable` is why this reads the whole offered list rather than one tool. The
 * rule only ever meant "not again until something changes", and where nothing
 * offered can change anything it means "never again" -- so a repair whose
 * policy withheld every mutating option looked once, for free, before it was
 * asked anything, and could not look a second time. That is not a gate the
 * domain asked for; it is a gate that appeared because a different gate closed.
 * The harness-option registry already drops an explicit `repeatPolicy` for
 * exactly this reason, and dropping it there was never enough, because an
 * initial observation carries the same rule implicitly. With no mutation
 * reachable the loop's own duplicate-request check is what bounds repeating:
 * the same tool with the same input is still refused, so looking again has to
 * ask something new.
 */
function requiresMutationBeforeRepeat(tool: AutomationStudioLlmEvidenceTool, mutable: boolean): boolean {
  return mutable && (tool.repeatPolicy === "after_mutation" || tool.initialObservation !== undefined);
}

function parseToolExecutionResult(
  value: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult,
  effect: AutomationStudioLlmEvidenceTool["effect"]
): { evidence: JsonValue; effectApplied: boolean; resultCode?: string } | undefined {
  if (isRecord(value) && value.kind === "llm_evidence_tool_execution") {
    if (!exactKeys(value, ["kind", "evidence", "effectApplied", "resultCode"]) || !isJsonValue(value.evidence) || typeof value.effectApplied !== "boolean"
      || (value.resultCode !== undefined && (typeof value.resultCode !== "string" || !/^[a-z0-9_.:-]{1,100}$/i.test(value.resultCode)))) return undefined;
    return { evidence: value.evidence, effectApplied: value.effectApplied, ...(value.resultCode ? { resultCode: value.resultCode } : {}) };
  }
  if (!isJsonValue(value)) return undefined;
  return { evidence: value, effectApplied: effect !== "mutate" };
}

export function buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools: AutomationStudioLlmEvidenceTool[], completionSchema: JsonObject = { type: "object" }, allowComplete = true): JsonObject {
  return {
    oneOf: [
      ...(allowComplete ? [{
        type: "object", additionalProperties: false, required: ["kind", "result"],
        properties: { kind: { const: "complete" }, result: structuredClone(completionSchema) }
      }] : []),
      ...tools.map((tool) => ({
        type: "object", additionalProperties: false, required: ["kind", "callId", "toolId", "input"],
        properties: {
          kind: { const: "tool_call" }, callId: { type: "string", pattern: "^[a-zA-Z0-9_.:-]{1,200}$" },
          toolId: { const: tool.toolId }, input: structuredClone(tool.inputSchema)
        }
      }))
    ]
  };
}

function parseDecision(value: unknown): AutomationStudioLlmEvidenceLoopDecision | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "complete" && exactKeys(value, ["kind", "result", "usage"]) && isJsonObject(value.result) && validUsage(value.usage)) {
    return { kind: "complete", result: value.result, ...(value.usage ? { usage: value.usage as AutomationStudioLlmUsageSummary } : {}) };
  }
  if (value.kind === "tool_call" && exactKeys(value, ["kind", "callId", "toolId", "input", "usage"])
    && validId(value.callId) && validId(value.toolId) && isJsonObject(value.input) && validUsage(value.usage)) {
    return { kind: "tool_call", callId: value.callId, toolId: value.toolId, input: value.input, ...(value.usage ? { usage: value.usage as AutomationStudioLlmUsageSummary } : {}) };
  }
  return undefined;
}

type EvidenceLoopLimits = {
  maxIterations: number;
  maxToolCalls: number;
  maxEvidenceBytes: number;
  maxEvidenceContextBytes: number;
  minToolCalls: number;
  maxStepsWithoutProgress: number;
  maxUnusableDecisionsInARow: number;
};

function resolveLimits(input: AutomationStudioLlmEvidenceLoopInput): EvidenceLoopLimits | undefined {
  const maxEvidenceBytes = input.maxEvidenceBytes ?? 262_144;
  const maxIterations = input.maxIterations ?? 8;
  const unusable = input.unusableDecisions;
  if (input.maxStepsWithoutProgress !== undefined && unusable?.maxConsecutive !== undefined
    && input.maxStepsWithoutProgress !== unusable.maxConsecutive) return undefined;
  const maxStepsWithoutProgress = input.maxStepsWithoutProgress ?? unusable?.maxConsecutive
    ?? Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_MAX_CONSECUTIVE_UNUSABLE_DECISIONS, maxIterations);
  const limits: EvidenceLoopLimits = {
    maxIterations,
    maxToolCalls: input.maxToolCalls ?? 8,
    maxEvidenceBytes,
    maxEvidenceContextBytes: input.maxEvidenceContextBytes ?? Math.min(64_000, maxEvidenceBytes),
    minToolCalls: input.minToolCalls ?? 0,
    maxStepsWithoutProgress,
    maxUnusableDecisionsInARow: unusable?.maxInARow
      ?? Math.max(maxStepsWithoutProgress, Math.min(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNUSABLE_DECISIONS_IN_A_ROW, maxIterations))
  };
  if (!Number.isInteger(limits.maxStepsWithoutProgress) || limits.maxStepsWithoutProgress < 1 || limits.maxStepsWithoutProgress > maxIterations) return undefined;
  if (unusable && (typeof unusable.stalled !== "function"
    || !Number.isInteger(limits.maxUnusableDecisionsInARow) || limits.maxUnusableDecisionsInARow < limits.maxStepsWithoutProgress
    || limits.maxUnusableDecisionsInARow > maxIterations)) return undefined;
  if (!Number.isInteger(limits.maxIterations) || limits.maxIterations <= 0 || limits.maxIterations > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations) return undefined;
  if (!Number.isInteger(limits.maxToolCalls) || limits.maxToolCalls <= 0 || limits.maxToolCalls > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls) return undefined;
  if (!Number.isInteger(limits.maxEvidenceBytes) || limits.maxEvidenceBytes <= 0 || limits.maxEvidenceBytes > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes) return undefined;
  if (!Number.isInteger(limits.maxEvidenceContextBytes) || limits.maxEvidenceContextBytes < 1_024 || limits.maxEvidenceContextBytes > limits.maxEvidenceBytes) return undefined;
  if (!Number.isInteger(limits.minToolCalls) || limits.minToolCalls < 0 || limits.minToolCalls > limits.maxToolCalls || limits.minToolCalls >= limits.maxIterations) return undefined;
  return limits;
}

/**
 * A check's answer, or `undefined` when it is not one. Issue codes are kept
 * only when they are codes; feedback only when it is bounded JSON.
 */
function parseCompletionCheck(value: unknown): { ok: true } | { ok: false; issueCodes: string[]; feedback: JsonObject } | undefined {
  if (!isRecord(value)) return undefined;
  if (value.ok === true && exactKeys(value, ["ok"])) return { ok: true };
  if (value.ok !== false || !exactKeys(value, ["ok", "issueCodes", "feedback"]) || !Array.isArray(value.issueCodes) || !isJsonObject(value.feedback)) return undefined;
  const issueCodes = value.issueCodes.filter((code): code is string => typeof code === "string" && /^[a-z0-9_.:-]{1,100}$/i.test(code));
  return { ok: false, issueCodes, feedback: structuredClone(value.feedback) };
}

/**
 * The evidence the model is shown for one decision: as much as the byte budget
 * carries, newest first, always in the order it happened.
 *
 * The newest result of each tool is taken first, and only then is what is left
 * filled in. The decision instruction tells the model that evidence entries are
 * "the current authoritative results of prior tool calls", and a window that
 * drops one of those while keeping an older, superseded entry contradicts it.
 *
 * Taking them newest-first was not enough, because an observation is made
 * early and answered against late. A live Flow Bootstrap observed the page it
 * had to author against on the first tool call, spent two more calls on smaller
 * things, and by the third decision -- the one that writes the Flow -- the page
 * was the oldest entry and the first one dropped, while a 76-byte refusal it
 * had already acted on stayed. So the model wrote the plan with the evidence
 * gone: every step of `run-mu6efrsv-f5b52d6a`'s Flow named `target.1`,
 * `target.2`, `target.3`, which are the page's first three elements and none of
 * them the control that step needed, and the build was refused
 * `web.handle.wrong_control`. The handles it needed had been in front of it two
 * calls earlier.
 *
 * An entry that does not fit is skipped rather than ending the walk: a single
 * large old entry no longer hides every smaller one behind it.
 */
function evidenceContextWindow(
  evidence: Array<{ callId: string; toolId: string; value: JsonValue }>,
  maxBytes: number
): Array<{ callId: string; toolId: string; value: JsonValue }> {
  // The newest entry of each tool, by index. Walked newest first, so the first
  // sighting of a toolId is its current result.
  const current = new Set<number>();
  const seen = new Set<string>();
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const { toolId } = evidence[index]!;
    if (seen.has(toolId)) continue;
    seen.add(toolId);
    current.add(index);
  }
  // `JSON.stringify` of the array is "[", the entries joined by ",", then "]",
  // which is what these bytes count. Measured per entry rather than by
  // re-serializing the whole window, so the two cannot disagree on a separator.
  const chosen = new Set<number>();
  let usedBytes = 2;
  const take = (index: number): void => {
    // Held to the provider's own count as well as the bytes: completion feedback
    // adds entries that are not tool calls, and a request carrying more than a
    // provider accepts is refused before it is sent.
    if (chosen.size >= AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls) return;
    const addedBytes = Buffer.byteLength(JSON.stringify(evidence[index]!), "utf8") + (chosen.size ? 1 : 0);
    if (usedBytes + addedBytes > maxBytes) return;
    chosen.add(index);
    usedBytes += addedBytes;
  };
  for (let index = evidence.length - 1; index >= 0; index -= 1) if (current.has(index)) take(index);
  for (let index = evidence.length - 1; index >= 0; index -= 1) if (!current.has(index)) take(index);
  return [...chosen].sort((left, right) => left - right).map((index) => evidence[index]!);
}

function validTools(tools: AutomationStudioLlmEvidenceTool[]): boolean {
  if (!Array.isArray(tools) || !tools.length || tools.length > 32) return false;
  const ids = new Set<string>();
  const structurallyValid = tools.every((tool) => validId(tool.toolId) && !ids.has(tool.toolId) && Boolean(ids.add(tool.toolId))
    && typeof tool.description === "string" && tool.description.length > 0 && tool.description.length <= 2_000 && isJsonObject(tool.inputSchema)
    && (tool.effect === undefined || tool.effect === "observe" || tool.effect === "mutate")
    && (tool.repeatPolicy === undefined || (tool.repeatPolicy === "after_mutation" && tool.effect === "observe"))
    && (tool.initialObservation === undefined || (tool.effect === "observe" && isJsonObject(tool.initialObservation) && exactKeys(tool.initialObservation, ["input"]) && isJsonObject(tool.initialObservation.input))));
  return structurallyValid
    && tools.filter((tool) => tool.initialObservation !== undefined).length <= 1
    && (!tools.some((tool) => tool.repeatPolicy === "after_mutation") || tools.some((tool) => tool.effect === "mutate"));
}

function failure(code: AutomationStudioLlmEvidenceLoopFailureCode, trace: AutomationStudioLlmEvidenceLoopTrace[], accounting: AutomationStudioLlmEvidenceLoopAccounting): AutomationStudioLlmEvidenceLoopResult {
  return { ok: false, code, trace, accounting };
}

function emptyAccounting(): AutomationStudioLlmEvidenceLoopAccounting {
  return { iterations: 0, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 };
}

function addUsage(accounting: AutomationStudioLlmEvidenceLoopAccounting, usage?: AutomationStudioLlmUsageSummary): void {
  if (!usage) return;
  accounting.inputTokens += usage.inputTokens ?? 0;
  accounting.outputTokens += usage.outputTokens ?? 0;
  accounting.totalTokens += usage.totalTokens ?? ((usage.inputTokens ?? 0) + (usage.outputTokens ?? 0));
  accounting.estimatedCostUsd += usage.estimatedCostUsd ?? 0;
}

function validUsage(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !exactKeys(value, ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"])) return false;
  return [value.inputTokens, value.outputTokens, value.totalTokens].every((item) => item === undefined || (Number.isSafeInteger(item) && (item as number) >= 0))
    && (value.estimatedCostUsd === undefined || (typeof value.estimatedCostUsd === "number" && Number.isFinite(value.estimatedCostUsd) && value.estimatedCostUsd >= 0));
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function validId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9_.:-]{1,200}$/i.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isJsonObject(value: unknown): value is JsonObject { return isRecord(value) && isJsonValue(value); }
function isJsonValue(value: unknown, seen = new Set<object>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || depth > 20 || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 1_000 && value.every((item) => isJsonValue(item, seen, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 1_000 && entries.every(([key, item]) => key.length <= 500 && isJsonValue(item, seen, depth + 1));
}
