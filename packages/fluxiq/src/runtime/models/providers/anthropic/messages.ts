import type { ModelTransportObservation, ModelTransportObserver } from "../../transport/index.ts";
import { automationStudioAnthropicReplyContainsCredential } from "./credential-screen.ts";
import type { AutomationStudioLlmUsageSummary } from "../../contracts/index.ts";
import { AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS, AutomationStudioLlmProviderError, automationStudioLlmSignalTimedOut } from "../../failures/index.ts";
import { readAutomationStudioProviderBoundedResponse, readAutomationStudioProviderRefusal, raceAutomationStudioProviderSignal, automationStudioProviderBalanceExhausted } from "../../transport/index.ts";
import type { AutomationStudioAnthropicModel } from "../../catalog/index.ts";
import { isRecord } from "../../transport/index.ts";
import { automationStudioAnthropicCacheWriteTokens, automationStudioAnthropicUsage } from "./pricing.ts";
import { readAutomationStudioAnthropicStream } from "./stream.ts";
import type { JsonObject } from "../../../../core/index.ts";

export const AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const AUTOMATION_STUDIO_ANTHROPIC_API_VERSION = "2026-10-21";

export type AutomationStudioAnthropicMessageInput<T> = {
  body: string;
  observe?: ModelTransportObserver;
  screenMessage: (value: string) => string;
  model: AutomationStudioAnthropicModel;
  resolveKey(signal: AbortSignal): Promise<string>;
  fetchImpl: typeof fetch;
  maxResponseBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
  requestId?: string;
  taskKind: string;
  stage?: string;
  iteration?: number;
  requestShape?: JsonObject;
  readAnswer(text: string, usage: AutomationStudioLlmUsageSummary): T;
};

/** Native Messages transport shared by Flow tasks and chat; no key is retained across calls. */
export async function automationStudioAnthropicMessage<T>(input: AutomationStudioAnthropicMessageInput<T>): Promise<{ response: T; usage: AutomationStudioLlmUsageSummary }> {
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs <= 0 || input.timeoutMs > AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS) throw new AutomationStudioLlmProviderError("llm.provider_request_timeout_invalid", "Anthropic request timeout is invalid.");
  const controller = new AbortController();
  let timedOut = false;
  let key = "";
  let paid: AutomationStudioLlmUsageSummary | undefined;
  const parentAbort = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) parentAbort();
  else input.signal?.addEventListener("abort", parentAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  let step: ModelTransportObservation | undefined;
  try {
    try { key = await raceAutomationStudioProviderSignal(Promise.resolve().then(() => input.resolveKey(controller.signal)), controller.signal); }
    catch (error) {
      if (controller.signal.aborted) throw signalFailure(input.signal, timedOut);
      throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "The configured Anthropic key could not be released.");
    }
    if (!key || typeof key !== "string" || !key.trim()) throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "The configured Anthropic key could not be released.");
    if (input.body.includes(key)) throw new AutomationStudioLlmProviderError("llm.provider_credential_in_request", "The outbound request contains the configured credential.");
    if (controller.signal.aborted) throw signalFailure(input.signal, timedOut);
    step = input.observe?.({ provider: "anthropic", model: input.model, url: AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL, body: input.body, taskKind: input.taskKind, ...(input.taskKind === "panel_command" ? { kind: "chat" } : {}), ...(input.requestId ? { requestId: input.requestId } : {}), ...(input.stage ? { stage: input.stage } : {}), ...(input.iteration ? { iteration: input.iteration } : {}) });
    const sent = input.fetchImpl(AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL, {
      method: "POST", redirect: "manual", signal: controller.signal,
      headers: { authorization: `Bearer ${key}`, "anthropic-version": AUTOMATION_STUDIO_ANTHROPIC_API_VERSION, "content-type": "application/json", accept: "text/event-stream", ...(input.requestId ? { "x-request-id": input.requestId } : {}) }, body: input.body
    });
    let response: Response;
    try { response = await raceAutomationStudioProviderSignal(sent, controller.signal); }
    catch (error) {
      if (controller.signal.aborted) void sent.then((late) => {
        void late.body?.cancel().catch(/* best-effort: the late reply is discarded */ () => undefined);
      }).catch(/* best-effort: the call has already timed out */ () => undefined);
      throw error;
    }
    if (response.redirected || response.status >= 300 && response.status < 400 || response.url && response.url !== AUTOMATION_STUDIO_ANTHROPIC_MESSAGES_URL) {
      void response.body?.cancel().catch(/* best-effort: the redirect has already been refused */ () => undefined);
      throw new AutomationStudioLlmProviderError("llm.provider_redirect_rejected", "Anthropic redirected outside the fixed endpoint.");
    }
    if (!response.ok) {
      // Shared refusal screening drops credentials and locator-shaped text.
      const screened = await readAutomationStudioProviderRefusal({ response, maxResponseBytes: input.maxResponseBytes, request: input.requestShape ?? null, credential: key, screenMessage: input.screenMessage, signal: controller.signal });
      const balance = automationStudioProviderBalanceExhausted(response.status, screened.error);
      const refusal = automationStudioAnthropicReplyContainsCredential(screened, key)
        ? { ...screened, contentType: null, error: null, withheld: [...screened.withheld, "message_credential_shaped"] }
        : screened;
      const code = balance ? "llm.provider_balance_exhausted" : response.status === 401 || response.status === 403 ? "llm.provider_auth_failed" : response.status === 429 ? "llm.provider_rate_limited" : "llm.provider_http_error";
      throw new AutomationStudioLlmProviderError(code, "Anthropic refused the request.", !balance && (response.status === 429 || response.status >= 500), response.status, undefined, undefined, refusal);
    }
    let envelope: unknown;
    let raw: Uint8Array;
    const mediaType = response.headers.get("content-type") ?? "";
    if (/^text\/event-stream(?:\s*;|$)/i.test(mediaType)) {
      const streamed = await readAutomationStudioAnthropicStream(response, input.maxResponseBytes, controller.signal, (partial) => {
        // message_start's output count is provisional. Until a final delta
        // ends generation, the bill is unknown and Core keeps its conservative
        // reservation on failure instead of charging that initial 0/1 token.
        if (typeof partial.stop_reason === "string") paid = automationStudioAnthropicUsage(partial.usage, input.model) ?? paid;
      });
      raw = streamed.raw;
      envelope = streamed.envelope;
    } else if (/^application\/json(?:\s*;|$)/i.test(mediaType)) {
      const bytes = await readAutomationStudioProviderBoundedResponse(response, input.maxResponseBytes, controller.signal);
      raw = bytes;
      try { envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Anthropic returned malformed JSON."); }
    } else throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Anthropic returned an unexpected media type.");
    paid = isRecord(envelope) ? automationStudioAnthropicUsage(envelope.usage, input.model) : undefined;
    if (new TextDecoder().decode(raw).includes(key) || automationStudioAnthropicReplyContainsCredential(envelope, key)) throw new AutomationStudioLlmProviderError("llm.provider_output_invalid", "Anthropic response contained the configured credential.");
    if (!isRecord(envelope) || envelope.type !== "message" || envelope.role !== "assistant" || envelope.model !== input.model || !Array.isArray(envelope.content)) throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Anthropic returned an invalid message envelope.");
    if (envelope.stop_reason === "max_tokens" || envelope.stop_reason === "model_context_window_exceeded") throw new AutomationStudioLlmProviderError("llm.provider_output_truncated", "Anthropic stopped before completing its output.");
    if (envelope.stop_reason === "refusal" || isRecord(envelope.stop_details) && envelope.stop_details.type === "refusal") throw new AutomationStudioLlmProviderError("llm.provider_output_invalid", "Anthropic refused to produce the requested output.");
    if (envelope.stop_reason !== "end_turn") throw new AutomationStudioLlmProviderError("llm.provider_output_invalid", "Anthropic stopped without completing the requested answer.");
    const content: string[] = [];
    for (const block of envelope.content) {
      if (!isRecord(block)) throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Anthropic returned an invalid content block.");
      if (block.type === "text" && typeof block.text === "string") content.push(block.text);
      else if (block.type !== "thinking" && block.type !== "redacted_thinking") throw new AutomationStudioLlmProviderError("llm.provider_output_invalid", "Anthropic returned an unsupported content block.");
    }
    const text = content.join("");
    if (!text.trim()) step?.reply(raw, response.status);
    if (!text.trim()) throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Anthropic returned no answer.", false, undefined, undefined, undefined, undefined, { case: "content_empty", finishReason: "end_turn", contentChars: 0, ...(paid ? { usage: paid } : {}) }, undefined, paid);
    if (!paid) throw new AutomationStudioLlmProviderError("llm.provider_usage_invalid", "Anthropic returned invalid token usage.");
    // The paid account exists before schema validation can refuse the answer.
    let answer: T;
    try {
      answer = input.readAnswer(text, paid);
    } catch (error) {
      // An answer Core cannot read is the one a person most needs to see, so its raw reply is kept,
      // through the step log's own screen, once it has passed the credential check above. It is
      // never kept where the credential is in the text, however it was encoded in the envelope.
      if (!text.includes(key)) step?.reply(raw, response.status);
      throw error;
    }
    if (automationStudioAnthropicReplyContainsCredential(answer, key)) throw new AutomationStudioLlmProviderError("llm.provider_output_invalid", "Anthropic answer contained the configured credential.");
    // Logging comes last: JSON-text transport can reveal a credential only after its inner answer is decoded.
    step?.reply(raw, response.status);
    step?.succeeded(answer, { ...paid, cacheWriteInputTokens: automationStudioAnthropicCacheWriteTokens(isRecord(envelope) ? envelope.usage : undefined) });
    return { response: answer, usage: paid };
  } catch (error) {
    const failure = controller.signal.aborted ? signalFailure(input.signal, timedOut)
      : error instanceof AutomationStudioLlmProviderError ? error : new AutomationStudioLlmProviderError("llm.provider_network_error", "Anthropic request failed at the network boundary.", true);
    const accounted = withPaid(failure, paid);
    step?.failed(accounted);
    throw accounted;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", parentAbort);
    key = "";
  }
}

export function automationStudioAnthropicPaidFailure(code: "llm.provider_output_invalid" | "llm.provider_malformed_response" | "llm.provider_usage_limit_exceeded", usage: AutomationStudioLlmUsageSummary): AutomationStudioLlmProviderError {
  return withPaid(new AutomationStudioLlmProviderError(code, "Anthropic returned an unusable answer."), usage);
}

/** The failure with what the call cost, and, for a reply of a shape Core could not read, a case where the adapter named none. */
function withPaid(error: AutomationStudioLlmProviderError, paid: AutomationStudioLlmUsageSummary | undefined): AutomationStudioLlmProviderError {
  const reply = error.reply ?? (error.code === "llm.provider_malformed_response" ? { case: "envelope_shape" as const, ...(paid ? { usage: paid } : {}) } : undefined);
  if (!paid && !reply) return error;
  return new AutomationStudioLlmProviderError(error.code, error.message, error.retryable, error.status, error.provenance, error.responseBody, error.refusal, reply, error.inputSize, paid ?? error.paid);
}
function signalFailure(signal: AbortSignal | undefined, timedOut: boolean): AutomationStudioLlmProviderError {
  const timeout = timedOut || automationStudioLlmSignalTimedOut(signal);
  return new AutomationStudioLlmProviderError(timeout ? "llm.provider_timeout" : "llm.provider_aborted", timeout ? "Anthropic did not answer before its deadline." : "Anthropic request was cancelled.", timeout);
}
