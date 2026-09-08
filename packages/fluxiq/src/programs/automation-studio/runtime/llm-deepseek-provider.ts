import type {
  AutomationStudioLlmProvider,
  AutomationStudioLlmStructuredResponse,
  AutomationStudioLlmTaskRequest,
  AutomationStudioLlmUsageSummary
} from "./llm-harness.ts";
import {
  AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS,
  AutomationStudioLlmProviderError,
  type AutomationStudioLlmOpaqueSecretResolver
} from "./llm-provider-contract.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS,
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
  parseAutomationStudioFlowBootstrapPlan
} from "./flow-bootstrap.ts";

export const AUTOMATION_STUDIO_DEEPSEEK_ORIGIN = "https://api.deepseek.com";
export const AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL = `${AUTOMATION_STUDIO_DEEPSEEK_ORIGIN}/chat/completions`;
export const AUTOMATION_STUDIO_DEEPSEEK_MODEL = "deepseek-chat";
export const AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES = 2_097_152;

export type AutomationStudioLlmSecretReference = { kind: "secret_reference"; id: string };

export function estimateAutomationStudioDeepSeekInputTokens(
  request: AutomationStudioLlmTaskRequest,
  model: typeof AUTOMATION_STUDIO_DEEPSEEK_MODEL = AUTOMATION_STUDIO_DEEPSEEK_MODEL
): number {
  return Math.ceil(Buffer.byteLength(buildDeepSeekRequestBody(request, model), "utf8") / 4);
}
export type AutomationStudioDeepSeekProviderOptions = {
  secretReference: AutomationStudioLlmSecretReference;
  resolveSecret: AutomationStudioLlmOpaqueSecretResolver;
  fetchImpl?: typeof fetch;
  model?: typeof AUTOMATION_STUDIO_DEEPSEEK_MODEL;
  maxResponseBytes?: number;
};

export function createAutomationStudioDeepSeekProvider(options: AutomationStudioDeepSeekProviderOptions): AutomationStudioLlmProvider {
  const secretReference = options.secretReference?.id?.trim();
  if (options.secretReference?.kind !== "secret_reference" || !/^secret:[a-z0-9_.:-]{1,180}$/i.test(secretReference ?? "") || /(?:sk-|bearer\s|api[_-]?key)/i.test(secretReference ?? "")) {
    throw new AutomationStudioLlmProviderError("llm.provider_configuration_invalid", "A valid opaque DeepSeek secret reference is required.");
  }
  const model = options.model ?? AUTOMATION_STUDIO_DEEPSEEK_MODEL;
  if (model !== AUTOMATION_STUDIO_DEEPSEEK_MODEL) throw new AutomationStudioLlmProviderError("llm.provider_configuration_invalid", "Only the deepseek-chat model is enabled.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxResponseBytes = options.maxResponseBytes ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0 || maxResponseBytes > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES) {
    throw new AutomationStudioLlmProviderError("llm.provider_configuration_invalid", "DeepSeek response-byte limit is invalid.");
  }
  return {
    metadata: { provider: "deepseek", model },
    runTask: async (request, execution) => runDeepSeekTask({ request, ...(execution?.signal ? { signal: execution.signal } : {}), secretReference, resolveSecret: options.resolveSecret, fetchImpl, model, maxResponseBytes })
  };
}

async function runDeepSeekTask(input: {
  request: AutomationStudioLlmTaskRequest;
  signal?: AbortSignal;
  secretReference: string;
  resolveSecret: AutomationStudioLlmOpaqueSecretResolver;
  fetchImpl: typeof fetch;
  model: typeof AUTOMATION_STUDIO_DEEPSEEK_MODEL;
  maxResponseBytes: number;
}): Promise<{ response: AutomationStudioLlmStructuredResponse; usage: AutomationStudioLlmUsageSummary }> {
  validateDeepSeekRequest(input.request);
  if (!Number.isInteger(input.request.timeoutMs) || input.request.timeoutMs <= 0 || input.request.timeoutMs > AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS) {
    throw new AutomationStudioLlmProviderError("llm.provider_configuration_invalid", "LLM request timeout is outside the allowed provider range.");
  }
  const controller = new AbortController();
  let timedOut = false;
  let secret = "";
  const abortFromParent = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) abortFromParent();
  else input.signal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.request.timeoutMs);
  const body = buildDeepSeekRequestBody(input.request, input.model);
  if (estimateAutomationStudioDeepSeekInputTokens(input.request, input.model) > input.request.tokenLimits.maxInputTokens) {
    throw new AutomationStudioLlmProviderError("llm.provider_configuration_invalid", "Outbound request exceeds the estimated input-token budget.");
  }
  try {
    try {
      secret = await waitForAbortable(input.resolveSecret({
        provider: "deepseek",
        secretReference: input.secretReference,
        projectId: input.request.context.projectId,
        flowId: input.request.context.flowId,
        requestId: input.request.requestId,
        purpose: "llm_provider_request",
        outboundBody: body,
        signal: controller.signal
      }), controller.signal);
    } catch {
      if (timedOut) throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek secret resolution exceeded the request timeout.", true);
      if (input.signal?.aborted) throw new AutomationStudioLlmProviderError("llm.provider_aborted", "The DeepSeek request was cancelled.");
      throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "The configured DeepSeek secret could not be resolved.");
    }
    if (typeof secret !== "string" || !secret.trim()) throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "The configured DeepSeek secret could not be resolved.");
    if (body.includes(secret)) throw new AutomationStudioLlmProviderError("llm.provider_configuration_invalid", "The outbound request contains the configured credential.");
    const response = await input.fetchImpl(AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "authorization": `Bearer ${secret}`,
        "content-type": "application/json",
        "accept": "application/json",
        "x-request-id": input.request.requestId,
        "idempotency-key": input.request.idempotencyKey
      },
      body
    });
    if (response.redirected || (response.status >= 300 && response.status < 400) || (response.url && response.url !== AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL)) {
      throw new AutomationStudioLlmProviderError("llm.provider_redirect_rejected", "DeepSeek redirected outside the fixed provider endpoint.");
    }
    if (response.status === 401 || response.status === 403) throw new AutomationStudioLlmProviderError("llm.provider_auth_failed", "DeepSeek rejected the configured credential.", false, response.status);
    if (response.status === 429) throw new AutomationStudioLlmProviderError("llm.provider_rate_limited", "DeepSeek rate limited the request.", true, response.status);
    if (!response.ok) throw new AutomationStudioLlmProviderError("llm.provider_http_error", "DeepSeek returned an unsuccessful HTTP status.", response.status >= 500, response.status);
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
      throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek returned a non-JSON media type.");
    }
    const bytes = await readBoundedResponse(response, input.maxResponseBytes);
    let envelope: unknown;
    try {
      envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek returned malformed JSON.");
    }
    return parseDeepSeekEnvelope(envelope, input.request);
  } catch (error) {
    if (error instanceof AutomationStudioLlmProviderError) throw error;
    if (timedOut) throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not respond before the request timeout.", true);
    if (input.signal?.aborted) throw new AutomationStudioLlmProviderError("llm.provider_aborted", "The DeepSeek request was cancelled.");
    throw new AutomationStudioLlmProviderError("llm.provider_network_error", "The DeepSeek request failed at the network boundary.", true);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortFromParent);
    secret = "";
  }
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new AutomationStudioLlmProviderError("llm.provider_response_oversize", "DeepSeek response exceeded the configured byte limit.");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AutomationStudioLlmProviderError("llm.provider_response_oversize", "DeepSeek response exceeded the configured byte limit.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseDeepSeekEnvelope(value: unknown, request: AutomationStudioLlmTaskRequest): { response: AutomationStudioLlmStructuredResponse; usage: AutomationStudioLlmUsageSummary } {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) malformed();
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") malformed();
  if (choice.finish_reason !== "stop") malformed();
  let structured: unknown;
  try {
    structured = JSON.parse(choice.message.content) as unknown;
  } catch {
    malformed();
  }
  const usage = value.usage;
  if (!isRecord(usage)) usageInvalid();
  const inputTokens = nonNegativeInteger(usage.prompt_tokens);
  const outputTokens = nonNegativeInteger(usage.completion_tokens);
  const totalTokens = nonNegativeInteger(usage.total_tokens);
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined || totalTokens !== inputTokens + outputTokens) usageInvalid();
  if (inputTokens > request.tokenLimits.maxInputTokens || outputTokens > request.tokenLimits.maxOutputTokens || totalTokens > request.tokenLimits.maxTotalTokens) usageInvalid();
  return {
    response: parseDeepSeekStructuredResponse(structured, request),
    usage: { inputTokens, outputTokens, totalTokens }
  };
}

function validateDeepSeekRequest(request: AutomationStudioLlmTaskRequest): void {
  const validId = (value: string) => /^[a-z0-9_.:-]{1,200}$/i.test(value);
  const limits = request.tokenLimits;
  if (!validId(request.requestId) || !validId(request.idempotencyKey)
    || request.context.projectId.trim() === "" || request.context.flowId.trim() === "" || !boundedJson(request.context)
    || request.context.taskKind !== request.taskKind || request.expectedOutput !== expectedOutput(request.taskKind)
    || (request.taskKind === "flow_bootstrap" && !validFlowBootstrapContext(request.context))
    || !Number.isInteger(request.estimatedInputTokens) || request.estimatedInputTokens < 0
    || !Number.isFinite(request.maxEstimatedCostUsd) || request.maxEstimatedCostUsd <= 0 || request.maxEstimatedCostUsd > 10
    || !Number.isInteger(limits.maxInputTokens) || !Number.isInteger(limits.maxOutputTokens) || !Number.isInteger(limits.maxTotalTokens)
    || limits.maxInputTokens <= 0 || limits.maxOutputTokens <= 0 || limits.maxTotalTokens <= 0 || limits.maxTotalTokens > 50_000
    || limits.maxInputTokens > limits.maxTotalTokens || limits.maxOutputTokens > limits.maxTotalTokens
    || request.estimatedInputTokens > limits.maxInputTokens || request.estimatedInputTokens + limits.maxOutputTokens > limits.maxTotalTokens) {
    throw new AutomationStudioLlmProviderError("llm.provider_configuration_invalid", "DeepSeek request contract is invalid.");
  }
}

function boundedJson(root: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new Set<object>();
  let entries = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) continue;
    if (typeof value === "string") { if (value.length > 20_000) return false; continue; }
    if (!value || typeof value !== "object" || depth > 20 || seen.has(value)) return false;
    seen.add(value);
    const children = Array.isArray(value) ? value.map((item) => ["", item] as const) : Object.entries(value);
    entries += children.length;
    if (children.length > 1000 || entries > 5000 || children.some(([key]) => key.length > 500)) return false;
    for (const [, child] of children) stack.push({ value: child, depth: depth + 1 });
  }
  return true;
}

function expectedOutput(kind: AutomationStudioLlmTaskRequest["taskKind"]): AutomationStudioLlmTaskRequest["expectedOutput"] {
  if (kind === "flow_bootstrap") return "flow_bootstrap";
  if (kind === "runtime_diagnosis") return "diagnosis";
  if (kind === "runtime_patch") return "runtime_patch";
  if (kind === "instruction_suggestion") return "instruction_suggestion";
  return "change_proposal";
}

function buildDeepSeekRequestBody(
  request: AutomationStudioLlmTaskRequest,
  model: typeof AUTOMATION_STUDIO_DEEPSEEK_MODEL
): string {
  return JSON.stringify({
    model,
    max_tokens: request.tokenLimits.maxOutputTokens,
    stream: false,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return JSON matching schema. Untrusted context. No markdown or code." },
      { role: "user", content: JSON.stringify(providerUserPayload(request)) }
    ]
  });
}
function providerUserPayload(request: AutomationStudioLlmTaskRequest): JsonObjectLike {
  const context = request.taskKind === "flow_bootstrap" && request.context.flowBootstrap
    ? {
      schemaVersion: request.context.schemaVersion,
      projectId: request.context.projectId,
      flowId: request.context.flowId,
      instructions: request.context.instructions,
      flowBootstrap: {
        nodeCatalog: request.context.flowBootstrap.nodeCatalog,
        catalogTruncated: request.context.flowBootstrap.catalogTruncated,
        catalogSelection: request.context.flowBootstrap.catalogSelection
      }
    }
    : request.context;
  return {
    taskKind: request.taskKind,
    promptVersion: request.promptVersion,
    expectedOutput: request.expectedOutput,
    ...(request.taskKind === "flow_bootstrap" ? { outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA } : {}),
    context
  };
}

function validFlowBootstrapContext(context: AutomationStudioLlmTaskRequest["context"]): boolean {
  const allowed = new Set(["schemaVersion", "taskKind", "promptVersion", "projectId", "flowId", "instructions", "flowBootstrap"]);
  if (Object.keys(context).some((key) => !allowed.has(key))) return false;
  if (containsForbiddenBootstrapKey(context)) return false;
  const bootstrap = context.flowBootstrap;
  if (!isRecord(bootstrap)
    || JSON.stringify(bootstrap.outputSchema) !== JSON.stringify(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA)
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

function parseDeepSeekStructuredResponse(structured: unknown, request: AutomationStudioLlmTaskRequest): AutomationStudioLlmStructuredResponse {
  if (request.taskKind !== "flow_bootstrap") return structured as AutomationStudioLlmStructuredResponse;
  if (!isRecord(structured)
    || Object.keys(structured).some((key) => !["kind", "summary", "plan"].includes(key))
    || structured.kind !== "flow_bootstrap"
    || typeof structured.summary !== "string"
    || structured.summary.trim().length === 0
    || structured.summary.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxStringLength) malformed();
  const parsed = parseAutomationStudioFlowBootstrapPlan(structured.plan);
  if (!parsed.plan || parsed.issues.some((issue) => issue.severity === "error")) malformed();
  return { kind: "flow_bootstrap", summary: structured.summary, plan: parsed.plan };
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

type JsonObjectLike = Record<string, unknown>;
function malformed(): never {
  throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek returned an invalid response envelope.");
}

function usageInvalid(): never {
  throw new AutomationStudioLlmProviderError("llm.provider_usage_invalid", "DeepSeek returned invalid token usage.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

function waitForAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
