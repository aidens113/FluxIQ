import {
  AUTOMATION_STUDIO_LLM_MAX_RECENT_ACTIONS,
  automationStudioLlmRequestEvidenceRefusal,
  isAutomationStudioLlmRecentActionContext,
  type AutomationStudioLlmTaskRequest
} from "../harness.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProviderPreflightErrorCode } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS, automationStudioFlowBootstrapOutputSchema, automationStudioFlowBootstrapSizeLimitsOfContext } from "../../flow-bootstrap/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../evidence-loop.ts";
import { automationStudioDeepSeekExpectedOutput } from "./output-schema.ts";
import { isRecord } from "./json-record.ts";

const AUTOMATION_STUDIO_DEEPSEEK_MAX_INTERNAL_CONTEXT_ENTRIES = 20_000;

// Each check refuses with its own code, in the order they are made. They were
// one condition and one code, which is how a stale field list went unnoticed.
export function validateAutomationStudioDeepSeekRequest(request: AutomationStudioLlmTaskRequest): void {
  const validId = (value: string) => /^[a-z0-9_.:-]{1,200}$/i.test(value);
  const limits = request.tokenLimits;
  if (!validId(request.requestId) || !validId(request.idempotencyKey)) refuse("llm.provider_request_identity_invalid", "DeepSeek request identity is invalid.");
  if (request.context.projectId.trim() === "" || request.context.flowId.trim() === "") refuse("llm.provider_request_scope_invalid", "DeepSeek request names no project or Flow.");
  if (!boundedJson(request.context)) refuse("llm.provider_request_context_unbounded", "DeepSeek request context is not bounded JSON.");
  if (!validRecentActions(request.context.recentActions)) refuse("llm.provider_recent_actions_invalid", "DeepSeek request recent actions are not the packet's projection.");
  // Every evidence slot, each under its own code: Core's shared pre-send check.
  const evidenceRefusal = automationStudioLlmRequestEvidenceRefusal(request);
  if (evidenceRefusal) refuse(evidenceRefusal, "DeepSeek request evidence did not pass Core's pre-send check.");
  if (request.context.taskKind !== request.taskKind || request.expectedOutput !== automationStudioDeepSeekExpectedOutput(request.taskKind)) {
    refuse("llm.provider_request_task_mismatch", "DeepSeek request task kind and expected output disagree.");
  }
  if (request.taskKind === "flow_bootstrap" && !validFlowBootstrapContext(request.context)) refuse("llm.provider_flow_bootstrap_context_invalid", "DeepSeek Flow bootstrap context is invalid.");
  if (request.taskKind === "evidence_tool_decision" && !validEvidenceLoopContext(request.context)) refuse("llm.provider_evidence_loop_context_invalid", "DeepSeek evidence loop context is invalid.");
  if (!Number.isInteger(request.estimatedInputTokens) || request.estimatedInputTokens < 0
    || !Number.isFinite(request.maxEstimatedCostUsd) || request.maxEstimatedCostUsd <= 0 || request.maxEstimatedCostUsd > 10
    || !Number.isInteger(limits.maxInputTokens) || !Number.isInteger(limits.maxOutputTokens) || !Number.isInteger(limits.maxTotalTokens)
    || limits.maxInputTokens <= 0 || limits.maxOutputTokens <= 0 || limits.maxTotalTokens <= 0 || limits.maxTotalTokens > 64_000
    || limits.maxInputTokens > limits.maxTotalTokens || limits.maxOutputTokens > limits.maxTotalTokens
    || request.estimatedInputTokens > limits.maxInputTokens || request.estimatedInputTokens + limits.maxOutputTokens > limits.maxTotalTokens) {
    refuse("llm.provider_request_limits_invalid", "DeepSeek request token or cost limits are invalid.");
  }
}

function refuse(code: AutomationStudioLlmProviderPreflightErrorCode, message: string): never {
  throw new AutomationStudioLlmProviderError(code, message);
}

/** The packet's own projection, checked by the packet's own rule. */
function validRecentActions(actions: unknown): boolean {
  if (!actions) return true;
  return Array.isArray(actions) && actions.length <= AUTOMATION_STUDIO_LLM_MAX_RECENT_ACTIONS && actions.every(isAutomationStudioLlmRecentActionContext);
}

function boundedJson(root: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number; leave?: true }> = [{ value: root, depth: 0 }];
  const active = new Set<object>();
  let entries = 0;
  while (stack.length) {
    const { value, depth, leave } = stack.pop()!;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) continue;
    if (typeof value === "string") { if (value.length > 20_000) return false; continue; }
    if (!value || typeof value !== "object") return false;
    if (leave) { active.delete(value); continue; }
    if (depth > 20 || active.has(value)) return false;
    active.add(value);
    stack.push({ value, depth, leave: true });
    let children: ReadonlyArray<readonly [string, unknown]>;
    try {
      children = Array.isArray(value) ? value.map((item) => ["", item] as const) : Object.entries(value);
    } catch {
      return false;
    }
    entries += children.length;
    if (children.length > 1000 || entries > AUTOMATION_STUDIO_DEEPSEEK_MAX_INTERNAL_CONTEXT_ENTRIES || children.some(([key]) => key.length > 500)) return false;
    for (const [, child] of children) stack.push({ value: child, depth: depth + 1 });
  }
  return true;
}

function validFlowBootstrapContext(context: AutomationStudioLlmTaskRequest["context"]): boolean {
  const allowed = new Set(["schemaVersion", "taskKind", "promptVersion", "projectId", "flowId", "instructions", "flowBootstrap", "reusableContext", "metadata"]);
  if (Object.keys(context).some((key) => !allowed.has(key))) return false;
  if (containsForbiddenBootstrapKey(context)) return false;
  if (context.metadata !== undefined
    && (!isRecord(context.metadata)
      || Object.keys(context.metadata).some((key) => key !== "source")
      || context.metadata.source !== "generateFlowBootstrapAdaptation")) return false;
  const bootstrap = context.flowBootstrap;
  if (!isRecord(bootstrap)
    || JSON.stringify(bootstrap.outputSchema) !== JSON.stringify(automationStudioFlowBootstrapOutputSchema(automationStudioFlowBootstrapSizeLimitsOfContext(bootstrap)))
    || !Array.isArray(bootstrap.nodeCatalog)
    || bootstrap.nodeCatalog.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogEntries
    || typeof bootstrap.catalogTruncated !== "boolean"
    || !isRecord(bootstrap.catalogSelection)) return false;
  const selection = bootstrap.catalogSelection;
  const catalogBytes = Buffer.byteLength(JSON.stringify(bootstrap.nodeCatalog), "utf8");
  return Number.isInteger(selection.byteBudget)
    && Number.isInteger(selection.usedBytes)
    && selection.byteBudget > 0
    && selection.byteBudget <= AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxCatalogBytes
    && selection.usedBytes === catalogBytes
    && catalogBytes <= selection.byteBudget
    && Array.isArray(selection.requiredTerms)
    && selection.requiredTerms.every((term) => typeof term === "string" && term.length > 0 && term.length <= 64)
    && Array.isArray(selection.missingRequiredTerms)
    && selection.missingRequiredTerms.length === 0;
}

// The iteration and evidence bounds are the loop's own ceilings. They were a
// literal sixteen here, left behind when the loop's ceiling was raised, so a
// real exploration was refused at its seventeenth decision.
function validEvidenceLoopContext(context: AutomationStudioLlmTaskRequest["context"]): boolean {
  const loop = context.evidenceLoop;
  if (!isRecord(loop) || !Number.isInteger(loop.iteration) || (loop.iteration as number) < 1
    || (loop.iteration as number) > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations
    || !Array.isArray(loop.tools) || loop.tools.length > 32
    || !Array.isArray(loop.evidence) || loop.evidence.length > AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls) return false;
  const ids = new Set<string>();
  for (const tool of loop.tools) {
    if (!isRecord(tool) || Object.keys(tool).some((key) => !["toolId", "description", "inputSchema", "effect", "perCallEffect", "repeatPolicy", "initialObservation"].includes(key))
      || typeof tool.toolId !== "string" || !/^[a-z0-9_.:-]{1,200}$/i.test(tool.toolId) || ids.has(tool.toolId)
      || typeof tool.description !== "string" || tool.description.length < 1 || tool.description.length > 2_000
      || !isRecord(tool.inputSchema)
      || (tool.effect !== undefined && tool.effect !== "observe" && tool.effect !== "mutate")
      || (tool.repeatPolicy !== undefined && (tool.repeatPolicy !== "after_mutation" || tool.effect !== "observe"))
      || (tool.perCallEffect !== undefined && typeof tool.perCallEffect !== "boolean")
      // A free first look is a look. That is a tool that only observes -- or one
      // whose calls declare their own effect, whose initial argument the host
      // writes rather than the model, and which is therefore the host's
      // statement that this one call observes.
      || (tool.initialObservation !== undefined && ((tool.effect !== "observe" && tool.perCallEffect !== true) || !isRecord(tool.initialObservation) || Object.keys(tool.initialObservation).some((key) => key !== "input") || !isRecord(tool.initialObservation.input)))) return false;
    ids.add(tool.toolId);
  }
  for (const item of loop.evidence) {
    if (!isRecord(item) || Object.keys(item).some((key) => !["callId", "toolId", "value"].includes(key))
      || typeof item.callId !== "string" || !/^[a-z0-9_.:-]{1,200}$/i.test(item.callId)
      || typeof item.toolId !== "string" || !/^[a-z0-9_.:-]{1,200}$/i.test(item.toolId) || !boundedJson(item.value)) return false;
  }
  if (!isRecord(loop.completionSchema) || typeof loop.canComplete !== "boolean") return false;
  // The decision schema must be one Core built from the tools it offered, and
  // there are two of them: with and without the variant that edits the draft.
  // Which one the loop sent is its own decision -- offered only once there is a
  // step to edit, and withdrawn once the run's allowance is spent -- and is not
  // carried on the wire, so both are derived and either is accepted. What this
  // still refuses is the thing it was written to refuse: a schema that is not
  // Core's, over tools that were not offered.
  const written = JSON.stringify(loop.decisionSchema);
  // And, since 2026-09-30, with and without the fields a call authors the draft
  // with (`add`, `act`), which a loop offers only where the model authors it.
  return [false, true].some((allowAmend) => [false, true].some((authoring) =>
    written === JSON.stringify(buildAutomationStudioLlmEvidenceLoopDecisionSchema(loop.tools, loop.completionSchema, loop.canComplete, allowAmend, authoring))));
}

function containsForbiddenBootstrapKey(root: unknown): boolean {
  const stack: unknown[] = [root];
  const seen = new Set<object>();
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value as object)) continue;
    seen.add(value as object);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/recording|timeline/i.test(key)) return true;
      stack.push(child);
    }
  }
  return false;
}
