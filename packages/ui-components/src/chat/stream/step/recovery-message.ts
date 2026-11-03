// One recovery Core reported on a run step, as its own chat message: what
// happened and why in words (`recovery-words.ts`), and a card naming what it
// acted on and how it went. Drawn from the row's closed `recovery` fields
// (`stepRecovery`), never from Core's sentence. No DOM.
//
// The card says "Done" for a recovery that moved the run on, "Didn't work"
// for one that itself failed, and "Not done: ..." for one held back before it
// ran, which takes no failure's colour (`card-words.ts`).

import type { ActivityStepRecovery, ClientGatewayActivity } from "fluxiq/ui";
import type { ActionCard } from "./action-card.ts";
import type { StepMessage } from "./messages.ts";
import { recoveryWords } from "./recovery-words.ts";

/** Where the message and its card are kept: the keys of the event that opened them. */
export type RecoveryKeys = { message: string; card: string };

/** The message for `event`'s `recovery`, opened at `at`; `step` is the label of the step it was for, when known. */
export function recoveryMessage(event: ClientGatewayActivity, keys: RecoveryKeys, at: number, recovery: ActivityStepRecovery, step: string | undefined): StepMessage {
  const words = recoveryWords(recovery, step);
  const card: ActionCard = {
    kind: words.icon,
    name: words.name,
    target: words.target,
    outcome: recovery.outcome === "succeeded" ? "done" : "failed",
    why: null,
    // Held back before it ran: nothing was tried, so "Not done", never "Didn't work".
    ...(words.because === undefined ? {} : { refused: { all: true, because: words.because } }),
    key: keys.card,
    said: undefined,
    answer: undefined,
    check: false
  };
  return {
    key: keys.message,
    activityId: event.activityId,
    kind: "recovery",
    title: words.title,
    text: words.text,
    actions: [card],
    at,
    sequence: event.sequence,
    latest: false
  };
}
