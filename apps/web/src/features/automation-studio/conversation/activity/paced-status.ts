// Core's activity events as the one status a person reads, at a pace a person
// can read: the shared pacer every FluxIQ client draws its status from
// (`ActivityPacer` in `fluxiq/ui`), so this chat's live line says the same
// headline and detail as the web extension's, changed no faster (one detail
// change per 1.6 s; a new headline or outcome at once).
//
// Three things sit around the shared pacer here:
//
// - A wait is said in this panel's own words (`host-words.ts`): a question is
//   answered here, so it never says "answer in the FluxIQ panel".
//
// - The pacer takes each event once, already known to be newer than every one
//   before it. Each poll hands the current event again, so an event no newer
//   than the last one taken is ignored.
// - The shared display is read into the shape the live line draws: its
//   unit of work, headline, detail and outcome. A run Core holds for the person
//   (`paused`) is a wait in the shared display; here it keeps its own outcome,
//   `paused`, as the live line has always drawn it.
//
// Pure apart from the injected clock: no browser API, no network.

import { ActivityPacer, type ActivityClock, type ActivityDisplay } from "fluxiq/ui";
import type { ConversationActivity } from "./contracts";
import { CONVERSATION_ACTIVITY_HOST_WORDS } from "./host-words";

/** How the unit of work stands: settled, waiting on the person, held while the person has the page, or still working (null). */
export type ConversationActivityOutcome = "done" | "failed" | "waiting" | "paused" | null;

export type ConversationActivityDisplay = {
  activityId: string;
  headline: string;
  /** The latest event in words, or null when it would only repeat the headline. */
  detail: string | null;
  outcome: ConversationActivityOutcome;
  sequence: number;
};

export class ConversationPacedStatus {
  private readonly pacer: ActivityPacer;
  private lastSequence = Number.NEGATIVE_INFINITY;

  constructor(clock: ActivityClock, onChange: (display: ConversationActivityDisplay) => void, detailIntervalMs?: number) {
    this.pacer = new ActivityPacer({
      clock,
      hostWords: CONVERSATION_ACTIVITY_HOST_WORDS,
      onChange: (display) => onChange(conversationDisplayOf(display)),
      ...(detailIntervalMs === undefined ? {} : { detailIntervalMs })
    });
  }

  /** What a person sees now; null before the first event. */
  display(): ConversationActivityDisplay | null {
    const shown = this.pacer.display();
    return shown === null ? null : conversationDisplayOf(shown);
  }

  /** Takes Core's latest event. One no newer than the last taken is ignored. */
  accept(event: ConversationActivity): void {
    if (event.sequence <= this.lastSequence) return;
    this.lastSequence = event.sequence;
    this.pacer.accept(event);
  }

  dispose(): void {
    this.pacer.dispose();
  }
}

function conversationDisplayOf(display: ActivityDisplay): ConversationActivityDisplay {
  return {
    activityId: display.activityId,
    headline: display.headline,
    detail: display.detail,
    outcome: display.outcome === "waiting" && display.phase === "paused" ? "paused" : display.outcome,
    sequence: display.sequence
  };
}
