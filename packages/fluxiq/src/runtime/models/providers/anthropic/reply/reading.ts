import { AutomationStudioLlmProviderError, type AutomationStudioLlmProviderReplyAccount } from "../../../failures/index.ts";
import { isRecord } from "../../../transport/index.ts";
import { automationStudioAnthropicReplyCase } from "./case.ts";
import { automationStudioAnthropicReplyJson } from "./json.ts";

/**
 * The answer object in a reply's text. In the JSON-text transport that is the
 * decoded `result_json` of the one-key envelope, an object or a string holding
 * one. A reply that cannot be read is refused as malformed with an account of
 * which case it was, its stop reason and length, and what the call cost, and
 * never a word of what it said: the loop tells the model what was wrong and
 * asks again. The call was paid for either way, so the account carries the bill.
 */
export function automationStudioAnthropicReadReply(text: string, jsonText: boolean, stopReason: string | undefined, paid: AutomationStudioLlmProviderReplyAccount["usage"]): unknown {
  const refuse = (about: string, reason: AutomationStudioLlmProviderReplyAccount["case"] = automationStudioAnthropicReplyCase(about)): never => {
    throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Anthropic returned an unreadable answer.", false, undefined, undefined, undefined, undefined, { case: reason, ...(stopReason && /^[a-z0-9_.:-]{1,40}$/iu.test(stopReason) ? { finishReason: stopReason } : {}), contentChars: about.length, ...(paid ? { usage: paid } : {}) }, undefined, paid);
  };
  const outer = automationStudioAnthropicReplyJson(text);
  if (!outer.ok) return refuse(text);
  if (!jsonText) return outer.value;
  if (!isRecord(outer.value) || Object.keys(outer.value).length !== 1 || !("result_json" in outer.value)) return refuse(text, "envelope_shape");
  const inner = outer.value.result_json;
  // An object where the schema asked for its text is the same answer, only unwrapped.
  if (isRecord(inner)) return inner;
  if (typeof inner !== "string") return refuse(text, "envelope_shape");
  const decoded = automationStudioAnthropicReplyJson(inner);
  if (!decoded.ok) return refuse(inner);
  // An answer encoded twice is decoded once more.
  if (typeof decoded.value === "string") {
    const again = automationStudioAnthropicReplyJson(decoded.value);
    return again.ok ? again.value : refuse(decoded.value);
  }
  return decoded.value;
}
