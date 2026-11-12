// The attempt's answer to loop detection's last two rungs (plan D14; t859's
// `runtime/llm/decision-handlers/loop-signal.ts`). `change_approach` ends the round, and the next
// one is fresh from the page as it stands, with what was tried; `ask_person` ends it too, and the
// attempt steers the next round onto a different way (`./stuck-steer.ts`) and posts the person a
// question built from what the signal found (`./stuck-question.ts`), without waiting for it.
//
// **Synchronous, because the loop asks synchronously.** The answer is always `end`: nothing a
// signal needs can be done between two calls of one round. What is counted is read off the
// round's own rows afterwards (`./loops-caught.ts`), so a signal is not counted twice.

import type { AutomationStudioLlmLoopSignal, AutomationStudioLlmLoopSignalAnswer } from "../../../../../runtime/llm/repeat-guard/index.ts";

/** The loop input's `loopSignal`, as a key to spread in (header). */
export function automationStudioAnswerFirstLoopSignal(handlers: {
  /** Fresh approaches looped too: the next thing the attempt does is ask, about what `signal` found. */
  askPerson(signal: AutomationStudioLlmLoopSignal): void;
}): { loopSignal(signal: AutomationStudioLlmLoopSignal): AutomationStudioLlmLoopSignalAnswer } {
  return {
    loopSignal: (signal) => {
      if (signal.kind === "ask_person") handlers.askPerson(signal);
      return "end";
    }
  };
}
