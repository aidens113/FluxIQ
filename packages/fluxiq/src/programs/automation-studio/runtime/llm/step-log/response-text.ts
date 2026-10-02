import { automationStudioLlmStepLogReadable } from "./readable.ts";

/** What a reply's envelope says, read once for `response.txt` and the step's meta. */
export type AutomationStudioLlmStepLogReply = {
  envelope: Record<string, unknown> | undefined;
  finishReason: string | undefined;
  text: string;
};

/**
 * `response.txt`: the reply of `response.json` laid out to be read -- the
 * model's content (rendered readable when it is JSON), its reasoning when the
 * provider sent any, why it stopped, and what it used. A reply that is not an
 * OpenAI-shaped envelope, such as a refusal's error object, is rendered whole.
 */
export function automationStudioLlmStepLogResponseText(raw: string, status: number): AutomationStudioLlmStepLogReply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    /* best-effort: a reply that is not JSON is shown as it arrived */
    return { envelope: undefined, finishReason: undefined, text: `HTTP ${status}\n\n==== body (${raw.length} chars, not JSON) ====\n${raw}\n` };
  }
  const envelope = isRecord(parsed) ? parsed : undefined;
  const choice = Array.isArray(envelope?.choices) && isRecord(envelope.choices[0]) ? envelope.choices[0] : undefined;
  const message = isRecord(choice?.message) ? choice.message : undefined;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined;
  const out: string[] = [`HTTP ${status}`, `finish reason: ${finishReason ?? "-"}`];
  if (!message) {
    out.push("", "==== body ====", automationStudioLlmStepLogReadable(parsed));
    return { envelope, finishReason, text: `${out.join("\n")}\n` };
  }
  const content = message.content;
  out.push("", `==== content (${typeof content === "string" ? content.length : 0} chars) ====`, contentText(content));
  if (typeof message.reasoning_content === "string" && message.reasoning_content) {
    out.push("", `==== reasoning_content (${message.reasoning_content.length} chars) ====`, message.reasoning_content);
  }
  const rest = Object.fromEntries(Object.entries(message).filter(([key]) => key !== "content" && key !== "reasoning_content" && key !== "role"));
  if (Object.keys(rest).length) out.push("", "==== other message fields ====", automationStudioLlmStepLogReadable(rest));
  if (envelope?.usage !== undefined) out.push("", "==== usage ====", automationStudioLlmStepLogReadable(envelope.usage));
  return { envelope, finishReason, text: `${out.join("\n")}\n` };
}

function contentText(content: unknown): string {
  if (typeof content !== "string") return automationStudioLlmStepLogReadable(content ?? null);
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return automationStudioLlmStepLogReadable(JSON.parse(trimmed) as unknown);
    } catch {
      /* best-effort: content that does not parse is shown exactly as the model wrote it */
      return content;
    }
  }
  return content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
