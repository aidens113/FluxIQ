// DeepSeek reading a person's message in the chat window.
//
// The adapter beside this (`provider.ts`) answers Core's structured Flow tasks
// -- bootstrap, repair, diagnosis -- each with a fixed schema, a system prompt
// written for that task and pre-flight checks over evidence packets. A message
// typed into the chat window is none of those: it is a sentence, the panel's
// capability vocabulary and the end of a thread, and the answer is one small
// JSON object naming what to do. So this is its own call, sharing the adapter's
// endpoint, default model, bounded read and error vocabulary, and nothing else.
//
// What it keeps from the adapter's discipline:
//
// - The key is resolved per call, for the person who sent the message, and is
//   never held: `resolveKey` is asked each time and the value lives only in
//   this function's scope.
// - The outbound body is checked for the key before it is sent, so a key that
//   somehow reached the thread is refused rather than echoed back to DeepSeek.
// - A reply is read under the adapter's byte ceiling.
// - Every failure is an `AutomationStudioLlmProviderError` with a code and a
//   `retryable` flag, which is what the conversation's retry and its plain
//   English account of the failure both read (`conversations/instructions/`).

import type {
  AutomationStudioConversationCaller,
  AutomationStudioConversationModel,
  AutomationStudioConversationModelRequest,
  AutomationStudioConversationModelTurn
} from "../../conversations/index.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { automationStudioLlmProviderReplyAccount } from "../reply-account.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES, readAutomationStudioDeepSeekBoundedResponse } from "./bounded-read.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, isAutomationStudioDeepSeekModel, type AutomationStudioDeepSeekModel } from "./models.ts";
import { estimateAutomationStudioDeepSeekCostUsd } from "./pricing.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL } from "./provider.ts";
import { automationStudioLlmStepLogModelStep } from "../step-log/index.ts";

/** The most a decision may run to. The answer is one small object; this is room for a reply in words. */
const PANEL_COMMAND_MAX_OUTPUT_TOKENS = 600;

export type AutomationStudioDeepSeekPanelCommandOptions = {
  /** The key for this caller, released for one call. Throw when there is none to release. */
  resolveKey(caller: AutomationStudioConversationCaller | null): Promise<string>;
  fetchImpl?: typeof fetch;
  model?: AutomationStudioDeepSeekModel;
  maxResponseBytes?: number;
};

export function createAutomationStudioDeepSeekPanelCommandModel(options: AutomationStudioDeepSeekPanelCommandOptions): AutomationStudioConversationModel {
  const model = options.model ?? AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL;
  if (!isAutomationStudioDeepSeekModel(model)) throw new AutomationStudioLlmProviderError("llm.provider_model_unsupported", `DeepSeek model ${String(model)} is not one Core sends to.`);
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxResponseBytes = options.maxResponseBytes ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES;
  return {
    name: `deepseek:${model}`,
    decide: async (request, execution) => {
      const body = JSON.stringify(automationStudioDeepSeekPanelCommandBody(request, model));
      let key: string;
      try {
        key = await options.resolveKey(execution.caller);
      } catch (error) {
        // No key for this person right now: not a fault a retry fixes.
        throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", error instanceof Error ? error.message : "No model key could be released.", false);
      }
      if (!key) throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "No model key could be released.", false);
      if (body.includes(key)) throw new AutomationStudioLlmProviderError("llm.provider_credential_in_request", "The message would have carried the model key to the model.", false);
      // The step log's `NNNN-chat` folder (`../step-log/`): the exact body and reply, never the key. Undefined when off.
      const step = automationStudioLlmStepLogModelStep({
        provider: "deepseek", model, url: AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL, body, taskKind: "panel_command", kind: "chat",
        price: (usage) => estimateAutomationStudioDeepSeekCostUsd(usage.inputTokens, usage.outputTokens, usage.cacheHitInputTokens, model)
      });
      try {
        const response = await send(fetchImpl, body, key, execution.signal);
        const bytes = await readAutomationStudioDeepSeekBoundedResponse(response, maxResponseBytes);
        step?.reply(bytes, response.status);
        if (!response.ok) throw httpFailure(response.status);
        const content = panelCommandContent(new TextDecoder().decode(bytes));
        step?.succeeded({ content });
        return content;
      } catch (error) {
        step?.failed(error);
        throw error;
      }
    }
  };
}

/**
 * The request as DeepSeek receives it: the instructions as the system message,
 * the thread as alternating turns, and the new message last. JSON mode, no
 * thinking, temperature zero -- the answer is a choice, not prose.
 */
export function automationStudioDeepSeekPanelCommandBody(request: AutomationStudioConversationModelRequest, model: AutomationStudioDeepSeekModel): Record<string, unknown> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [{ role: "system", content: request.instructions }];
  for (const turn of request.transcript) messages.push(transcriptMessage(turn));
  messages.push({ role: "user", content: request.message });
  if (request.correction) messages.push({ role: "user", content: request.correction });
  return {
    model,
    messages,
    max_tokens: PANEL_COMMAND_MAX_OUTPUT_TOKENS,
    temperature: 0,
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    stream: false
  };
}

function transcriptMessage(turn: AutomationStudioConversationModelTurn): { role: "user" | "assistant"; content: string } {
  if (turn.author === "person") return { role: "user", content: turn.text };
  // What the panel did is said by FluxIQ's side of the conversation, marked so
  // the model does not read "Ran the Flow." as its own earlier words.
  return { role: "assistant", content: turn.author === "panel" ? `[The panel reported] ${turn.text}` : turn.text };
}

async function send(fetchImpl: typeof fetch, body: string, key: string, signal: AbortSignal): Promise<Response> {
  try {
    return await fetchImpl(AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
      body,
      redirect: "error",
      signal
    });
  } catch (error) {
    if (signal.aborted) throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not answer in time.", true);
    throw new AutomationStudioLlmProviderError("llm.provider_network_error", error instanceof Error ? `DeepSeek could not be reached (${error.name}).` : "DeepSeek could not be reached.", true);
  }
}

function httpFailure(status: number): AutomationStudioLlmProviderError {
  if (status === 401 || status === 403) return new AutomationStudioLlmProviderError("llm.provider_auth_failed", `DeepSeek refused the key (${status}).`, false, status);
  if (status === 429) return new AutomationStudioLlmProviderError("llm.provider_rate_limited", "DeepSeek is rate limiting.", true, status);
  return new AutomationStudioLlmProviderError("llm.provider_http_error", `DeepSeek answered ${status}.`, status >= 500, status);
}

/** The model's own words out of DeepSeek's envelope. The conversation parses them; an empty answer is a malformed one. */
function panelCommandContent(text: string): string {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek's reply was not JSON.", true, undefined, undefined, undefined, undefined, { case: "envelope_not_json" });
  }
  const choice = (envelope as { choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }> } | null)?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    // Which of the two it was, and why the provider stopped: never the reply (`../reply-account.ts`).
    const reply = automationStudioLlmProviderReplyAccount({ case: typeof content === "string" ? "content_empty" : "content_missing", finishReason: choice?.finish_reason, ...(typeof content === "string" ? { contentChars: content.length } : {}) });
    throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek's reply carried no answer.", true, undefined, undefined, undefined, undefined, reply);
  }
  return content;
}
