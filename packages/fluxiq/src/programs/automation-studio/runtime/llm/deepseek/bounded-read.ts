import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { raceAutomationStudioDeepSeekSignal } from "./signal-race.ts";

/**
 * How much of a reply this adapter will hold, by default and at most.
 *
 * Both a success and a refusal are read under the same ceiling: a provider
 * answering with a megabyte of HTML cannot be held in memory on the strength of
 * being wrong.
 */
export const AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES = 2_097_152;

/**
 * The reply's bytes, never more than `maxBytes` of them.
 *
 * A declared length over the ceiling is refused without reading anything; a
 * stream that passes it while being read is cancelled at the chunk that crosses
 * it. Both refuse with `llm.provider_response_oversize`, so a caller reading a
 * refusal body has one named condition to catch rather than a surprise.
 *
 * With a `signal`, the read ends when it aborts, with `llm.provider_timeout`,
 * and the body is cancelled: a reply DeepSeek starts and never finishes cannot
 * outlast the call's time limit (`./signal-race.ts`, t613). The same code
 * stands for a read the stream itself ended because the signal fired, so the
 * failure is named rather than left as a bare `TimeoutError`.
 */
export async function readAutomationStudioDeepSeekBoundedResponse(response: Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new AutomationStudioLlmProviderError("llm.provider_response_oversize", "DeepSeek response exceeded the configured byte limit.");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // Lets go of a body the time limit ended. Its own failure changes nothing: the read already failed as a timeout.
  const cancel = () => void reader.cancel(signal?.reason).catch(/* best-effort: the timeout is already thrown */ () => undefined);
  try {
    while (true) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await raceAutomationStudioDeepSeekSignal(reader.read(), signal, cancel);
      } catch (error) {
        if (signal?.aborted && !(error instanceof AutomationStudioLlmProviderError)) throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not answer in time.", true);
        throw error;
      }
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
