// What a task waiting for the person waits for, in plain words.

import type { ChatTaskAttempt } from "../../ports/index.ts";

type WaitingFor = Extract<ChatTaskAttempt, { status: "waiting_for_person" }>["waitingFor"];

/** The headline and the one sentence that says what to do. `hasResult`: it holds something to show. */
export function waitingWords(waitingFor: WaitingFor, hasResult: boolean): { headline: string; lead: string } {
  switch (waitingFor) {
    case "permission":
      return { headline: "Waiting for your permission", lead: "It needs your OK before it does something that cannot be taken back. Answer its question in the chat to carry on." };
    case "person_only_check":
      return { headline: "Waiting for you", lead: "It reached something only you can do, such as a sign-in or a check. Finish it on the page, then press Continue." };
    case "stuck_in_a_loop":
      return { headline: "I keep getting stuck on this", lead: `I stopped spending to ask you. ${hasResult ? "Here is what I have so far." : "I have nothing to show yet."}` };
  }
}
