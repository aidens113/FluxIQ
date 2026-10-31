import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { raceAutomationStudioProviderSignal } from "../provider-transport/index.ts";
import { isRecord } from "../provider-transport/index.ts";

export type AutomationStudioAnthropicStreamReply = { envelope: Record<string, unknown>; raw: Uint8Array };

/** Bounded SSE assembly. Delta usage is cumulative, and a message_stop is mandatory. */
export async function readAutomationStudioAnthropicStream(response: Response, maxBytes: number, signal: AbortSignal, progress: (envelope: Record<string, unknown>) => void): Promise<AutomationStudioAnthropicStreamReply> {
  if (Number(response.headers.get("content-length")) > maxBytes) throw oversize();
  if (!response.body) throw malformed();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  let pending = "";
  let envelope: Record<string, unknown> | undefined;
  let stopped = false;
  const blocks: Array<Record<string, unknown>> = [];
  const active = new Set<number>();
  const cancel = () => { void reader.cancel(signal.reason).catch(/* best-effort: the call has already ended */ () => undefined); };
  const event = (frame: string) => {
    const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    let value: unknown;
    try { value = JSON.parse(data); } catch { throw malformed(); }
    if (!isRecord(value) || typeof value.type !== "string") throw malformed();
    if (value.type === "ping") return;
    if (value.type === "error") {
      const type = isRecord(value.error) ? value.error.type : undefined;
      // Prose is never attached to a stream failure, which could quote input.
      const retry = type === "overloaded_error" || type === "api_error" || type === "rate_limit_error";
      throw new AutomationStudioLlmProviderError(type === "rate_limit_error" ? "llm.provider_rate_limited" : "llm.provider_http_error", "Anthropic ended the message stream with an error.", retry, type === "overloaded_error" ? 529 : type === "rate_limit_error" ? 429 : 500);
    }
    if (value.type === "message_start") {
      if (envelope || !isRecord(value.message) || !Array.isArray(value.message.content) || value.message.content.length) throw malformed();
      envelope = { ...value.message, content: blocks };
    } else if (value.type === "content_block_start") {
      if (!envelope || !Number.isInteger(value.index) || value.index !== blocks.length || !isRecord(value.content_block)) throw malformed();
      blocks.push({ ...value.content_block });
      active.add(value.index as number);
    } else if (value.type === "content_block_delta") {
      if (!Number.isInteger(value.index) || !active.has(value.index as number) || !isRecord(value.delta)) throw malformed();
      const block = blocks[value.index as number]!;
      if (value.delta.type === "text_delta") {
        if (block.type !== "text" || typeof value.delta.text !== "string") throw malformed();
        block.text = String(block.text ?? "") + value.delta.text;
      }
      // Thinking/signature deltas are not the answer and never become one.
    } else if (value.type === "content_block_stop") {
      if (!Number.isInteger(value.index) || !active.delete(value.index as number)) throw malformed();
    } else if (value.type === "message_delta") {
      if (!envelope || !isRecord(value.delta)) throw malformed();
      Object.assign(envelope, value.delta);
      if (isRecord(value.usage)) envelope.usage = { ...(isRecord(envelope.usage) ? envelope.usage : {}), ...value.usage };
    } else if (value.type === "message_stop") {
      if (!envelope || active.size || !envelope.stop_reason) throw malformed();
      stopped = true;
    }
    if (envelope) progress(envelope);
  };
  try {
    while (!stopped) {
      const next = await raceAutomationStudioProviderSignal(reader.read(), signal, cancel);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw oversize();
      chunks.push(next.value);
      // Normalize CRLF before frame splitting, including a CR split over chunks.
      try { pending += decoder.decode(next.value, { stream: true }); } catch { throw malformed(); }
      pending = pending.replace(/\r\n/g, "\n");
      let split: number;
      while ((split = pending.indexOf("\n\n")) >= 0) {
        const frame = pending.slice(0, split);
        pending = pending.slice(split + 2);
        if (stopped && frame.trim()) throw malformed();
        event(frame);
      }
    }
    try { pending += decoder.decode(); } catch { throw malformed(); }
    if (!stopped && pending.trim()) event(pending);
    if (!stopped || !envelope) throw malformed();
    const raw = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { envelope, raw };
  } finally {
    void reader.cancel().catch(/* best-effort: the stream outcome is already known */ () => undefined);
    reader.releaseLock();
  }
}

function malformed(): AutomationStudioLlmProviderError {
  return new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Anthropic returned an incomplete or invalid event stream.");
}
function oversize(): AutomationStudioLlmProviderError {
  return new AutomationStudioLlmProviderError("llm.provider_response_oversize", "Anthropic response exceeded the configured byte limit.");
}
