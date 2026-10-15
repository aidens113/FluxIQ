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
  let listener: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    listener = () => {
      // Rejected before `onAbort` releases anything: cancelling a body reader
      // settles its pending read at once, and that must not win the race.
      reject(new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not answer in time.", true));
      onAbort?.();
    };
    if (signal.aborted) listener();
    else signal.addEventListener("abort", listener, { once: true });
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    if (listener) signal.removeEventListener("abort", listener);
  }
}
