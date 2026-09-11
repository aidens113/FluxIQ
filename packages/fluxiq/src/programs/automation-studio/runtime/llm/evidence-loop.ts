import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmUsageSummary } from "./harness.ts";

export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS = {
  maxIterations: 16,
  maxToolCalls: 16,
  maxEvidenceBytes: 1_048_576
} as const;

/** Provider-neutral decision policy for bounded evidence loops. Provider adapters
 * should include this policy in their structured-decision instruction. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION = "Evidence entries are the current authoritative results of prior tool calls. Your goal is to produce the final structured result, not to execute the workflow that result describes. When the decision schema offers a complete variant, evaluate it first. Complete immediately once current evidence is sufficient to construct that result. Do not select a tool merely because one remains available. Use a tool only to resolve information still missing from the result; prefer observation over mutation. Use a mutating tool only when its state change is necessary to reveal otherwise unavailable evidence, such as navigating to a required page or exposing hidden content. Never mutate merely to perform an eventual workflow step that belongs in the generated result, and never repeat a successful mutation merely to try another eventual-workflow value. Never repeat the same toolId with the same input. Repeating an observation with different parameters is not progress. Do not call a mutating tool merely to unlock another observation. Treat a recoverable tool result shaped like {ok:false,code:string} as feedback and choose a different evidence-gathering action or complete if enough evidence is already available.";

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
  decision: "tool_call" | "complete";
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

export type AutomationStudioLlmEvidenceLoopFailureCode =
  | "llm_evidence_loop.invalid_configuration"
  | "llm_evidence_loop.invalid_decision"
  | "llm_evidence_loop.unknown_tool"
  | "llm_evidence_loop.duplicate_call"
  | "llm_evidence_loop.duplicate_tool_request"
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
  const callIds = new Set<string>();
  const toolRequestSignatures = new Set<string>();
  const observationEpochs = new Map<string, number>();
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
    toolRequestSignatures.add(canonicalJson([mutationEpoch, initialTool.toolId, initialInput]));
    observationEpochs.set(initialTool.toolId, mutationEpoch);
    evidence.push({ callId, toolId: initialTool.toolId, value: execution.evidence });
    trace.push({ iteration: 0, decision: "tool_call", callId, toolId: initialTool.toolId, evidenceBytes, ...(execution.resultCode ? { resultCode: execution.resultCode } : {}) });
  }
  for (let iteration = 1; iteration <= limits.maxIterations; iteration += 1) {
    if (input.signal?.aborted) return failure("llm_evidence_loop.cancelled", trace, accounting);
    accounting.iterations = iteration;
    let decision: AutomationStudioLlmEvidenceLoopDecision | undefined;
    const eligibleTools = input.tools.filter((tool) =>
      !requiresMutationBeforeRepeat(tool) || observationEpochs.get(tool.toolId) !== mutationEpoch
    );
    const eligibleToolIds = new Set(eligibleTools.map((tool) => tool.toolId));
    const canComplete = accounting.toolCalls >= limits.minToolCalls;
    if (!eligibleTools.length && !canComplete) return failure("llm_evidence_loop.repeat_without_progress", trace, accounting);
    try {
      const decisionSchema = buildAutomationStudioLlmEvidenceLoopDecisionSchema(eligibleTools, input.completionSchema, canComplete);
      decision = parseDecision(await input.decide({ iteration, tools: eligibleTools, evidence: evidenceContextWindow(evidence, limits.maxEvidenceContextBytes), decisionSchema, canComplete, ...(input.signal ? { signal: input.signal } : {}) }));
    } catch (error) {
      if (input.signal?.aborted) return failure("llm_evidence_loop.cancelled", trace, accounting);
      if (input.propagateDecisionErrors) throw error;
    }
    if (!decision) return failure("llm_evidence_loop.invalid_decision", trace, accounting);
    addUsage(accounting, decision.usage);
    if (decision.kind === "complete") {
      if (accounting.toolCalls < limits.minToolCalls) return failure("llm_evidence_loop.invalid_decision", trace, accounting);
      trace.push({ iteration, decision: "complete", ...(decision.usage ? { usage: decision.usage } : {}) });
      return { ok: true, result: decision.result, trace, accounting };
    }
    if (!toolIds.has(decision.toolId)) return failure("llm_evidence_loop.unknown_tool", trace, accounting);
    if (!eligibleToolIds.has(decision.toolId)) {
      trace.push({ iteration, decision: "tool_call", toolId: decision.toolId, resultCode: "llm_evidence_loop.rejected.repeat_without_progress" });
      return failure("llm_evidence_loop.repeat_without_progress", trace, accounting);
    }
    if (callIds.has(decision.callId)) return failure("llm_evidence_loop.duplicate_call", trace, accounting);
    const tool = toolsById.get(decision.toolId)!;
    if (requiresMutationBeforeRepeat(tool) && observationEpochs.get(tool.toolId) === mutationEpoch) {
      trace.push({ iteration, decision: "tool_call", toolId: decision.toolId, resultCode: "llm_evidence_loop.rejected.repeat_without_progress" });
      return failure("llm_evidence_loop.repeat_without_progress", trace, accounting);
    }
    const toolRequestSignature = canonicalJson([mutationEpoch, decision.toolId, decision.input]);
    if (toolRequestSignatures.has(toolRequestSignature)) {
      trace.push({ iteration, decision: "tool_call", toolId: decision.toolId, resultCode: "llm_evidence_loop.rejected.duplicate_tool_request" });
      return failure("llm_evidence_loop.duplicate_tool_request", trace, accounting);
    }
    if (accounting.toolCalls >= limits.maxToolCalls) return failure("llm_evidence_loop.iteration_limit", trace, accounting);
    callIds.add(decision.callId);
    toolRequestSignatures.add(toolRequestSignature);
    let rawExecution: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;
    try {
      rawExecution = await input.executeTool({ callId: decision.callId, toolId: decision.toolId, value: decision.input, maxEvidenceBytes: Math.max(1, Math.min(limits.maxEvidenceContextBytes - 512, limits.maxEvidenceBytes - accounting.evidenceBytes)), ...(input.signal ? { signal: input.signal } : {}) });
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
    if (tool.effect === "mutate" && effectApplied) mutationEpoch += 1;
    if (requiresMutationBeforeRepeat(tool)) observationEpochs.set(tool.toolId, mutationEpoch);
    evidence.push({ callId: decision.callId, toolId: decision.toolId, value });
    trace.push({ iteration, decision: "tool_call", callId: decision.callId, toolId: decision.toolId, evidenceBytes, ...(tool.effect === "mutate" ? { effectApplied } : {}), ...(resultCode ? { resultCode } : {}), ...(decision.usage ? { usage: decision.usage } : {}) });
  }
  return failure("llm_evidence_loop.iteration_limit", trace, accounting);
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** An initial observation is already the tool's observation for epoch zero.
 * Treat it as protected even when the domain omitted the redundant explicit
 * repeat policy, then allow it again only after an applied mutation. */
function requiresMutationBeforeRepeat(tool: AutomationStudioLlmEvidenceTool): boolean {
  return tool.repeatPolicy === "after_mutation" || tool.initialObservation !== undefined;
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

function resolveLimits(input: AutomationStudioLlmEvidenceLoopInput): { maxIterations: number; maxToolCalls: number; maxEvidenceBytes: number; maxEvidenceContextBytes: number; minToolCalls: number } | undefined {
  const maxEvidenceBytes = input.maxEvidenceBytes ?? 262_144;
  const limits = {
    maxIterations: input.maxIterations ?? 8,
    maxToolCalls: input.maxToolCalls ?? 8,
    maxEvidenceBytes,
    maxEvidenceContextBytes: input.maxEvidenceContextBytes ?? Math.min(64_000, maxEvidenceBytes),
    minToolCalls: input.minToolCalls ?? 0
  };
  if (!Number.isInteger(limits.maxIterations) || limits.maxIterations <= 0 || limits.maxIterations > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations) return undefined;
  if (!Number.isInteger(limits.maxToolCalls) || limits.maxToolCalls <= 0 || limits.maxToolCalls > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls) return undefined;
  if (!Number.isInteger(limits.maxEvidenceBytes) || limits.maxEvidenceBytes <= 0 || limits.maxEvidenceBytes > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes) return undefined;
  if (!Number.isInteger(limits.maxEvidenceContextBytes) || limits.maxEvidenceContextBytes < 1_024 || limits.maxEvidenceContextBytes > limits.maxEvidenceBytes) return undefined;
  if (!Number.isInteger(limits.minToolCalls) || limits.minToolCalls < 0 || limits.minToolCalls > limits.maxToolCalls || limits.minToolCalls >= limits.maxIterations) return undefined;
  return limits;
}

function evidenceContextWindow(
  evidence: Array<{ callId: string; toolId: string; value: JsonValue }>,
  maxBytes: number
): Array<{ callId: string; toolId: string; value: JsonValue }> {
  const selected: Array<{ callId: string; toolId: string; value: JsonValue }> = [];
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const candidate = [evidence[index]!, ...selected];
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > maxBytes) break;
    selected.unshift(evidence[index]!);
  }
  return selected;
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
