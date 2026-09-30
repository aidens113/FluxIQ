// The outcome line of an action card, in a person's words:
//
//   working   "Working on it", only on the newest card of work that is still
//             running; a card that never said it ended says nothing once the
//             work moved on or settled
//   done      "Done", or "Passed" for a test run
//   failed    "Didn't work", or "Didn't pass" for a test run, then why:
//             "Didn't work: it wasn't on the page"
//   waiting   "Waiting for you": a permission ask or a robot check
//
// `status` is the status word Core's `fluxiqStatusTone` reads, so a card takes
// its tone from the same table as every status badge in the panel. Pure.

import type { ConversationStepAction } from "./messages";

/** The outcome line; `state` drives the card's mark, `status` its tone. */
export type ConversationStepOutcomeWords = {
  state: ConversationStepAction["outcome"];
  status: "running" | "succeeded" | "failed" | "waiting";
  label: string;
};

/** The outcome line for `action`; `live` is true for the newest card of work still running. Null for none. */
export function conversationStepOutcomeWords(action: ConversationStepAction, live: boolean): ConversationStepOutcomeWords | null {
  const test = action.kind === "test";
  switch (action.outcome) {
    case "working":
      return live ? { state: "working", status: "running", label: "Working on it" } : null;
    case "waiting":
      return { state: "waiting", status: "waiting", label: "Waiting for you" };
    case "done": {
      const head = test ? "Passed" : "Done";
      return { state: "done", status: "succeeded", label: action.said ? `${head}. ${action.said}` : head };
    }
    case "failed": {
      const head = test ? "Didn't pass" : "Didn't work";
      const label = action.why ? `${head}: ${action.why}` : action.said ? `${head}. ${action.said}` : head;
      return { state: "failed", status: "failed", label };
    }
  }
}
