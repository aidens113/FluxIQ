// The attempt's answer to loop detection's last two rungs (plan D14; t859's
// `runtime/llm/decision-handlers/loop-signal.ts`). `change_approach` ends the round, and
// the next one is fresh from the page as it stands, with what was tried; `ask_person` ends
// it too, and the attempt then waits for the person before it spends any more.
//
// **Typed by shape, because t859 is not merged.** The signal's type lives in its worktree,
// so this states only what it reads. Spread into the loop input, the key is an excess
// property no one checks today and the loop's own field once t859 lands, and it takes
// effect then with nothing here changing.

/** What this reads of t859's `AutomationStudioLlmLoopSignal`. */
export type AutomationStudioAnswerFirstLoopSignalSeen = {
  kind: "change_approach" | "ask_person";
  pattern: string;
};

/** The two answers the loop takes, and the one given. */
type Answer = "continue" | "end";

/** The loop input's `loopSignal`, as a key to spread in (header). */
export function automationStudioAnswerFirstLoopSignal(handlers: {
  /** Told of a signal of either kind, for the attempt's `loopsCaught`. */
  caught(signal: AutomationStudioAnswerFirstLoopSignalSeen): void;
  /** Fresh approaches looped too: the next thing the attempt does is ask. */
  askPerson(): void;
}): { loopSignal(signal: AutomationStudioAnswerFirstLoopSignalSeen): Answer } {
  return {
    loopSignal: (signal) => {
      handlers.caught(signal);
      if (signal.kind === "ask_person") handlers.askPerson();
      return "end";
    }
  };
}
