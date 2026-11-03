import { AutomationStudioLlmProviderError } from "../../failures/index.ts";
import { raceAutomationStudioProviderSignal as raceAutomationStudioDeepSeekSignal } from "../../transport/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL } from "./endpoints.ts";

export async function sendDeepSeekRequest(fetchImpl: typeof fetch, body: string, key: string, signal: AbortSignal, options: { redirect?: RequestRedirect; headers?: Record<string, string>; raceSignal?: boolean; classifyFailure?: boolean } = {}): Promise<Response> {
  let sent: Promise<Response> | undefined;
  try {
    sent = fetchImpl(AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json", ...options.headers },
      body,
      redirect: options.redirect ?? "error",
      signal
    });
    return options.raceSignal === false ? await sent : await raceAutomationStudioDeepSeekSignal(sent, signal);
  } catch (error) {
    if (options.classifyFailure === false) throw error;
    if (signal.aborted) {
      // A reply that still arrives after the time limit is let go unread, so it holds no connection open.
      if (sent) void Promise.resolve(sent).then(releaseLateReply, /* best-effort: the timeout is already thrown */ () => undefined);
      throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not answer in time.", true);
    }
    throw new AutomationStudioLlmProviderError("llm.provider_network_error", error instanceof Error ? `DeepSeek could not be reached (${error.name}).` : "DeepSeek could not be reached.", true);
  }
}

function releaseLateReply(late: Response): void {
  late.body?.cancel().catch(/* best-effort: nobody reads this reply */ () => undefined);
}
