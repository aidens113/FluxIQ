// The key of the attempt the current call belongs to (t967, t971): the attempt's ladder, which every call of an attempt
// is made inside (`./frame.ts`) -- its decisions and the completion check they ask, whichever path started the attempt
// (a chat, a script, a caller such as FluxNode). A model's adapter reads it as the call is sent, to tell one attempt's
// conversation from another's (`../../anthropic/provider.ts`: a judge continues only its own attempt's decider).
//
// **Read at the call, never stamped on the way.** t967 stamped it on the request in the routing provider's `runTask`,
// but the harness never calls that: it asks the routing provider which model serves a request (`servedBy`) and calls
// that model's provider itself (`../../harness/run.ts`). So no live call ever carried a key, and every judge of run
// run-mwoq9g4l-dbd69bd6 said `no_attempt_key`. The frame is there wherever the call is made, so it is read there.
//
// One process-wide map per Core copy is enough: a ladder object is an attempt's own, and the map holds it weakly.

import { automationStudioLlmModelLadderFrame } from "./frame.ts";

const KEYS = new WeakMap<object, string>();
let made = 0;

/** The current attempt's key, the same for every call of it and another for another attempt; none outside every attempt. */
export function automationStudioLlmAttemptKey(): string | undefined {
  const ladder = automationStudioLlmModelLadderFrame();
  if (!ladder) return undefined;
  let key = KEYS.get(ladder);
  if (key === undefined) {
    made += 1;
    key = `attempt.${made}`;
    KEYS.set(ladder, key);
  }
  return key;
}
