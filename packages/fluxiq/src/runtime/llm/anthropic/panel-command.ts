import type { AutomationStudioConversationCaller, AutomationStudioConversationModel } from "../../conversations/index.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL, isAutomationStudioAnthropicModel, type AutomationStudioAnthropicModel } from "../models/index.ts";
import { AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS, AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES, AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES } from "../provider-transport/index.ts";
import { automationStudioAnthropicMessageBody } from "./request.ts";
import { automationStudioAnthropicOutputFormat } from "./schema.ts";
import { automationStudioAnthropicMessage, automationStudioAnthropicPaidFailure } from "./messages.ts";
import { isRecord } from "../provider-transport/index.ts";

export type AutomationStudioAnthropicPanelCommandOptions = {
  resolveKey(caller: AutomationStudioConversationCaller | null): Promise<string>;
  fetchImpl?: typeof fetch;
  model?: AutomationStudioAnthropicModel;
  maxResponseBytes?: number;
};

export function createAutomationStudioAnthropicPanelCommandModel(options: AutomationStudioAnthropicPanelCommandOptions): AutomationStudioConversationModel {
  const model = options.model ?? AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL;
  if (!isAutomationStudioAnthropicModel(model)) throw new AutomationStudioLlmProviderError("llm.provider_model_unsupported", "Unsupported Anthropic panel-command model.");
  const maxResponseBytes = options.maxResponseBytes ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0 || maxResponseBytes > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES) throw new AutomationStudioLlmProviderError("llm.provider_response_limit_invalid", "Anthropic response-byte limit is invalid.");
  return {
    name: `anthropic:${model}`,
    decide: async (request, execution) => {
      const messages: Array<{ role: "user" | "assistant"; content: string }> = request.transcript.map((turn) => ({ role: turn.author === "person" ? "user" : "assistant", content: turn.author === "panel" ? `[The panel reported] ${turn.text}` : turn.text }));
      messages.push({ role: "user", content: request.message });
      if (request.correction) messages.push({ role: "user", content: request.correction });
      const body = JSON.stringify(automationStudioAnthropicMessageBody({ model, system: request.instructions, messages, format: automationStudioAnthropicOutputFormat(undefined) }));
      let billed = false;
      try {
        const result = await automationStudioAnthropicMessage({ body, model, fetchImpl: options.fetchImpl ?? fetch, maxResponseBytes, timeoutMs: AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS, signal: execution.signal, taskKind: "panel_command", resolveKey: async () => await options.resolveKey(execution.caller), readAnswer: (text, usage) => {
          // A decision that cannot be read was still paid for.
          execution.paid?.(usage.estimatedCostUsd!);
          billed = true;
          try {
            const outer: unknown = JSON.parse(text);
            if (!isRecord(outer) || Object.keys(outer).length !== 1 || typeof outer.result_json !== "string" || !isRecord(JSON.parse(outer.result_json))) throw new Error("Malformed reply.");
            return outer.result_json;
          } catch { throw automationStudioAnthropicPaidFailure("llm.provider_malformed_response", usage); }
        } });
        return result.response;
      } catch (error) {
        // A refusal/truncation arrives before readAnswer, but still has usage.
        if (error instanceof AutomationStudioLlmProviderError && error.paid && !billed) execution.paid?.(error.paid.estimatedCostUsd!);
        throw error;
      }
    }
  };
}
