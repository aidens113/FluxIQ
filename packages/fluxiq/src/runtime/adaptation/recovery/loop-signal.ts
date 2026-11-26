// A recovery exploration's answer to loop detection's last two rungs (t1057).
//
// Handing the evidence loop a `loopSignal` is what makes it a loop no count ends:
// with one, none of its own counts of turns, calls, looks, refusals or unusable
// replies ends it, and a repeat goes up the ladder to the model's own decision
// instead (`../../llm/repeat-guard/loop-detection/watch.ts`). The answer-first
// rounds answer every signal `end`, because they can start a fresh round; an
// exploration cannot, so:
//
// - `change_approach` is answered `continue`. The repeat stays refused, the model
//   has already been told what it repeated, and the exploration goes on.
// - `ask_person` is answered `end`. It is the model's own decision, offered only
//   after it changed approach and the repeat came back, that it cannot go on
//   without a person. Nobody is asked in the middle of a Flow (t976), so the
//   exploration ends there with what it gathered, and the recovery goes on.

import type { AutomationStudioLlmLoopSignal, AutomationStudioLlmLoopSignalAnswer } from "../../llm/repeat-guard/index.ts";

/** The loop's `loopSignal`, and whether the model ended the exploration by deciding it needs a person. */
export function automationStudioExplorationLoopSignal(): {
  loopSignal(signal: AutomationStudioLlmLoopSignal): AutomationStudioLlmLoopSignalAnswer;
  askedForPerson(): boolean;
} {
  let asked = false;
  return {
    loopSignal: (signal) => {
      if (signal.kind !== "ask_person") return "continue";
      asked = true;
      return "end";
    },
    askedForPerson: () => asked
  };
}
