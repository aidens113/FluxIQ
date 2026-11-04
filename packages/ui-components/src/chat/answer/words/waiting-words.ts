// What a task waiting for the person waits for, in plain words.

import { modelKeyLockedWords } from "fluxiq/ui";
import type { ChatTaskAttempt } from "../../ports/index.ts";

type WaitingFor = Extract<ChatTaskAttempt, { status: "waiting_for_person" }>["waitingFor"];

/** The headline and the one sentence that says what to do. `hasResult`: it holds something to show. */
export function waitingWords(waitingFor: WaitingFor, hasResult: boolean): { headline: string; lead: string } {
  switch (waitingFor) {
    case "permission":
      return { headline: "Waiting for your permission", lead: "It needs your OK before it does something that cannot be taken back. Answer its question in the chat to carry on." };
    case "person_only_check":
      return { headline: "Waiting for you", lead: "It reached something only you can do, such as a sign-in or a check. Finish it on the page, then press Continue." };
    case "model_key_locked":
      return { headline: "Waiting for your password", lead: `${modelKeyLockedWords("unknown")} It carries on from here once you do.` };
    case "stuck_in_a_loop":
      return { headline: "I keep getting stuck on this", lead: `I stopped spending to ask you. ${hasResult ? "Here is what I have so far." : "I have nothing to show yet."}` };
    case "interrupted":
      return { headline: "This was cut off", lead: `FluxIQ restarted while I was working on it. ${hasResult ? "Here is what I have so far." : "I have nothing to show yet."} Press Keep going to carry on.` };
  }
}
