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
 * An event stream (Anthropic's Messages stream) is put back together first:
 * its text, each tool call by name with its input (a decision sent as a tool,
 * D12, t1038, arrives as input pieces nobody can read in the raw stream), why
 * it stopped and what it used; `response.json` keeps the stream as it came.
 */
export function automationStudioLlmStepLogResponseText(raw: string, status: number): AutomationStudioLlmStepLogReply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    const streamed = streamText(raw, status);
    if (streamed) return streamed;
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
  // A decision sent as tools (D12, t1038) has no content, and its call is read by name with its arguments laid out.
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls as unknown[] : [];
  if (typeof content === "string" || calls.length === 0) out.push("", `==== content (${typeof content === "string" ? content.length : 0} chars) ====`, contentText(content));
  for (const call of calls) {
    const fn = isRecord(call) && isRecord(call.function) ? call.function : undefined;
    if (!fn || typeof fn.arguments !== "string") out.push("", "==== tool call ====", automationStudioLlmStepLogReadable(call));
    else out.push("", `==== tool call ${typeof fn.name === "string" ? fn.name : "-"} (arguments ${fn.arguments.length} chars) ====`, contentText(fn.arguments));
  }
  if (typeof message.reasoning_content === "string" && message.reasoning_content) {
    out.push("", `==== reasoning_content (${message.reasoning_content.length} chars) ====`, message.reasoning_content);
  }
  const rest = Object.fromEntries(Object.entries(message).filter(([key]) => key !== "content" && key !== "reasoning_content" && key !== "role" && key !== "tool_calls"));
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

/**
 * An Anthropic event stream as one reply (header), or `undefined` where `raw` is no such stream or any event in it does
 * not parse: the raw body is then shown as it arrived. Thinking is left out, as the adapter leaves it out of the answer.
 * The envelope is not returned: its usage is not the shape the step's meta reads, and the adapter gives the step its
 * usage itself.
 */
function streamText(raw: string, status: number): AutomationStudioLlmStepLogReply | undefined {
  if (!/^\s*event:/u.test(raw)) return undefined;
  const blocks: Array<{ type: string; name?: string; text: string }> = [];
  let stopReason: string | undefined;
  let usage: Record<string, unknown> = {};
  try {
    for (const frame of raw.replace(/\r\n/gu, "\n").split("\n\n")) {
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (!data) continue;
      const event = JSON.parse(data) as Record<string, unknown>;
      const delta = isRecord(event.delta) ? event.delta : {};
      if (event.type === "message_start" && isRecord(event.message) && isRecord(event.message.usage)) usage = { ...event.message.usage };
      if (event.type === "content_block_start" && isRecord(event.content_block)) blocks[Number(event.index)] = { type: String(event.content_block.type), ...(typeof event.content_block.name === "string" ? { name: event.content_block.name } : {}), text: "" };
      const block = blocks[Number(event.index)];
      if (event.type === "content_block_delta" && block && typeof delta.text === "string") block.text += delta.text;
      if (event.type === "content_block_delta" && block && typeof delta.partial_json === "string") block.text += delta.partial_json;
      if (event.type === "message_delta" && typeof delta.stop_reason === "string") stopReason = delta.stop_reason;
      if (event.type === "message_delta" && isRecord(event.usage)) usage = { ...usage, ...event.usage };
    }
  } catch (error) {
    // An event that is not JSON: the stream is shown as it arrived. Anything else is not this reader's to hide.
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  const out: string[] = [`HTTP ${status}`, `finish reason: ${stopReason ?? "-"}`];
  for (const block of blocks) {
    if (block?.type === "text") out.push("", `==== text (${block.text.length} chars) ====`, contentText(block.text));
    else if (block?.type === "tool_use") out.push("", `==== tool call ${block.name ?? "-"} (input ${block.text.length} chars) ====`, contentText(block.text));
  }
  if (Object.keys(usage).length) out.push("", "==== usage ====", automationStudioLlmStepLogReadable(usage));
  return { envelope: undefined, finishReason: stopReason, text: `${out.join("\n")}\n` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
