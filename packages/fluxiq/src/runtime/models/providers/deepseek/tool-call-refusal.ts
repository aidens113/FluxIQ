import { AutomationStudioLlmProviderError, type AutomationStudioLlmProviderReplyAccount } from "../../failures/index.ts";

/**
 * The refusal of a reply whose tool call Core cannot use (D12, t1038): a paid `llm.provider_output_invalid` carrying
 * its account (`tool_call_missing`, `tool_call_several`, `tool_call_unknown`, `content_invalid`, ...), never the call's
 * content. The call was paid for, so the account's usage is what the ledger charges.
 */
export function automationStudioDeepSeekToolCallRefusal(reply: AutomationStudioLlmProviderReplyAccount, message = "DeepSeek's reply did not hold the one tool call the request asked for."): AutomationStudioLlmProviderError {
  return new AutomationStudioLlmProviderError("llm.provider_output_invalid", message, false, undefined, undefined, undefined, undefined, reply, undefined, reply.usage);
}
