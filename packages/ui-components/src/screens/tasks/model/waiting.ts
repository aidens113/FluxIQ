// What a wait is for, where the answer turn has no words of its own: an attempt a restart
// cut off, historical model access unavailability, and any reason this screen does not know. The three
// reasons the answer turn knows (a permission, a check only the person can do, a loop) are
// its to say, so `ownWaitingWords` answers nothing for them.
//
// `waitingFor` is read as a string: `interrupted` and `model_key_locked` join the type in
// other lanes, and a reason added later must still read as a plain wait, never a failure.
// Historical lock records stay readable without offering an obsolete password ceremony.

import type { ChatTaskOutcome } from "../../../chat/ports/index.ts";

/** The reason a person is waited on, or undefined when the attempt does not wait. */
export function waitingReason(attempt: ChatTaskOutcome["attempt"]): string | undefined {
  if (attempt.status !== "waiting_for_person") return undefined;
  const reason = (attempt as { waitingFor?: unknown }).waitingFor;
  return typeof reason === "string" ? reason : "";
}

const KNOWN = new Set(["permission", "person_only_check", "stuck_in_a_loop"]);

/** The headline and the sentence that follows, for a wait the answer turn does not word. */
export function ownWaitingWords(reason: string): { headline: string; lead: string } | undefined {
  if (KNOWN.has(reason)) return undefined;
  if (reason === "interrupted") {
    return { headline: "Stopped partway", lead: "FluxIQ was closed or restarted while this was working. Everything it did so far is kept, and you can carry on from there." };
  }
  if (reason === "model_key_locked") {
    return { headline: "Model access was unavailable", lead: "This task paused before model access was available. Check the current model configuration in FluxIQ, then try continuing." };
  }
  return { headline: "Waiting for you", lead: "It is waiting for something from you. Open it in the chat to see what." };
}
