import { AutomationStudioLlmProviderError } from "../provider-contract.ts";

/**
 * `work`, or `llm.provider_timeout` the moment `signal` aborts, whichever comes
 * first; `work` alone when there is no signal.
 *
 * The adapter does not leave its time limit to `fetch`. In A8 wave 4 (t613) a
 * chat attempt's timeout signal fired while Node's `fetch` was reading a body
 * DeepSeek never finished, and the read went on until the server let go: the
 * signal reached the caller and never reached the stream. So the send and every
 * read of the body race the signal here, and `onAbort` lets the caller release
 * what it holds (a body reader) when the race is lost.
 */
export async function raceAutomationStudioDeepSeekSignal<T>(work: Promise<T>, signal: AbortSignal | undefined, onAbort?: () => void): Promise<T> {
  if (!signal) return await work;
  // Already aborted: no race at all. `work` may be settled already (a chunk the
  // body had buffered), and a settled `work` wins `Promise.race` over a
  // rejection made in the same turn; `onAbort` then cancels the reader, the
  // next read reports `done`, and a body that never finished reads as a
  // complete one. A refusal read after the step log's copy was cut off met
  // exactly this (t617).
  if (signal.aborted) {
    work.catch(/* the call is already over; its outcome is not awaited */ () => undefined);
    onAbort?.();
    throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not answer in time.", true);
  }
  let listener: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    listener = () => {
      // Rejected before `onAbort` releases anything: cancelling a body reader
      // settles its pending read at once, and that must not win the race.
      reject(new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not answer in time.", true));
      onAbort?.();
    };
    signal.addEventListener("abort", listener, { once: true });
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    if (listener) signal.removeEventListener("abort", listener);
  }
}
