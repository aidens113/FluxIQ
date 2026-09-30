// Folds Core's activity events into the one status a person reads, at a pace
// a person can read.
//
// Core reports every seam of its work, often several inside a second. Shown as
// they come, the status flips faster than anyone can read it, which people
// call flicker. The pacer keeps what the events say and changes how often it
// is said, the same way the extension's pacer does:
//
// - `headline` names the unit of work and changes only when the work changes,
//   settles, starts repairing, or needs the person. Those changes show at once.
// - `detail` is the latest event in words (`wording.ts`). It changes at most
//   once per `intervalMs`: the first change in a quiet period shows at once,
//   and any that arrive before the period ends wait for its end, where only
//   the newest is shown. The last sentence always reaches the screen.
//
// Pure apart from the injected clock: no browser API, no network.

import type { ConversationActivity } from "./contracts";
import { conversationActivityHeadline, conversationActivityOutcome, type ConversationActivityOutcome } from "./headline";
import { conversationActivitySentence } from "./wording";

/** The shortest time between two changes of the detail line. */
export const CONVERSATION_ACTIVITY_DETAIL_INTERVAL_MS = 1_200;

export type ConversationActivityDisplay = {
  activityId: string;
  headline: string;
  /** The latest event in words, or null when it would only repeat the headline. */
  detail: string | null;
  outcome: ConversationActivityOutcome;
  sequence: number;
};

export type ConversationActivityClock = {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
};

export class ConversationActivityPacer {
  private shown: ConversationActivityDisplay | null = null;
  private pending: ConversationActivityDisplay | undefined;
  private timer: unknown;
  private detailChangedAt = Number.NEGATIVE_INFINITY;
  private repairingUnit: string | null = null;

  constructor(
    private readonly clock: ConversationActivityClock,
    private readonly onChange: (display: ConversationActivityDisplay) => void,
    private readonly intervalMs = CONVERSATION_ACTIVITY_DETAIL_INTERVAL_MS
  ) {}

  /** What a person sees now; null before the first event. */
  display(): ConversationActivityDisplay | null {
    return this.shown;
  }

  /** Takes Core's latest event. One no newer than the last taken is ignored. */
  accept(event: ConversationActivity): void {
    const latest = this.pending ?? this.shown;
    if (latest && event.sequence <= latest.sequence) return;
    if (event.phase === "repairing") this.repairingUnit = event.activityId;
    const next = this.displayFor(event);
    const now = this.clock.now();
    const shown = this.shown;
    const atOnce = shown === null || shown.activityId !== next.activityId || shown.headline !== next.headline || shown.outcome !== next.outcome;
    if (atOnce || now - this.detailChangedAt >= this.intervalMs) {
      this.cancelPending();
      this.show(next, now);
      return;
    }
    this.pending = next;
    this.timer ??= this.clock.setTimeout(() => this.showPending(), this.detailChangedAt + this.intervalMs - now);
  }

  dispose(): void {
    this.cancelPending();
  }

  private displayFor(event: ConversationActivity): ConversationActivityDisplay {
    const outcome = conversationActivityOutcome(event);
    const headline = conversationActivityHeadline(event.subject.kind, outcome, this.repairingUnit === event.activityId);
    const sentence = conversationActivitySentence(event);
    return {
      activityId: event.activityId,
      headline,
      detail: sentence.toLowerCase() === headline.toLowerCase() ? null : sentence,
      outcome,
      sequence: event.sequence
    };
  }

  private showPending(): void {
    this.timer = undefined;
    const next = this.pending;
    this.pending = undefined;
    if (next) this.show(next, this.clock.now());
  }

  private cancelPending(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }

  private show(next: ConversationActivityDisplay, now: number): void {
    const previous = this.shown;
    this.shown = next;
    if (previous === null || previous.detail !== next.detail) this.detailChangedAt = now;
    if (previous === null || previous.headline !== next.headline || previous.detail !== next.detail || previous.outcome !== next.outcome) this.onChange(next);
  }
}
