// What the activity port holds for one project: the events held per unit of
// work, the pacer that turns Core's newest event into the status a person
// reads, and the state last told. A different project starts a new session.

import type { ChatActivityState } from "@fluxiq/ui-components";
import { ActivityPacer } from "fluxiq/ui";
import { CONVERSATION_ACTIVITY_HOST_WORDS, holdConversationActivity, type ConversationActivity, type ConversationActivitySnapshot } from "../../automation-studio/conversation/activity";
import type { ActivityTimers } from "./timers";

export type ActivitySession = {
  readonly projectId: string;
  /** Takes one good read; answers the state it makes. */
  apply(snapshot: ConversationActivitySnapshot): ChatActivityState;
  /** The last state, with the stream marked as not reaching this client; null before the first good read. */
  markNotLive(): ChatActivityState | null;
  dispose(): void;
};

export function createActivitySession(projectId: string, timers: ActivityTimers, onPaced: (state: ChatActivityState) => void): ActivitySession {
  let held: ConversationActivity[] = [];
  let lastSequence = Number.NEGATIVE_INFINITY;
  let latest: ChatActivityState | null = null;
  const pacer = new ActivityPacer({
    clock: timers,
    hostWords: CONVERSATION_ACTIVITY_HOST_WORDS,
    // The paced line moves on its own timer between two reads; the listeners hear it.
    onChange: (display) => {
      if (latest === null) return;
      latest = { ...latest, display };
      onPaced(latest);
    }
  });
  return {
    projectId,
    apply(snapshot) {
      held = holdConversationActivity(held, snapshot);
      const current = snapshot.current;
      // The pacer takes each event once; every read hands the current one again.
      if (current !== null && current.sequence > lastSequence) {
        lastSequence = current.sequence;
        pacer.accept(current);
      }
      latest = { current, display: pacer.display(), recent: snapshot.recent, history: held, overlay: "hidden", live: true };
      return latest;
    },
    markNotLive() {
      if (latest !== null) latest = { ...latest, live: false };
      return latest;
    },
    dispose: () => pacer.dispose()
  };
}
