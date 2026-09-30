// The message stream: the thread's turns, with Core's activity folded into one
// quiet group per stretch of work between two turns.
//
// A row per event made the transcript read as a log: fourteen framed boxes
// between a question and its answer. A person reads "Worked for 2m 5s ·
// 14 steps" under their message and opens it when they want the steps. The
// group at the tail of the stream is the live one while Core is still working;
// the status line above its steps is drawn there, in place, not in a banner
// over the transcript.

import type { ConversationTurn } from "../thread";
import type { ConversationActivity } from "./contracts";
import { interleaveConversationActivity } from "./model";

export type ConversationActivityGroup = {
  /** Stable for the life of the group: the sequence of its first row. */
  key: string;
  rows: ConversationActivity[];
  /** The group's work as a whole: the last row's unit of work. */
  activityId: string;
};

export type ConversationStreamEntry =
  | { kind: "turn"; key: string; turn: ConversationTurn }
  | { kind: "activity"; key: string; group: ConversationActivityGroup };

/**
 * Turns in order, and between them the activity rows grouped. Rows Core marks
 * as its own bookkeeping (`detail.kind` "note") are not shown.
 */
export function conversationStream(input: Parameters<typeof interleaveConversationActivity>[0]): ConversationStreamEntry[] {
  const stream: ConversationStreamEntry[] = [];
  let open: ConversationActivityGroup | null = null;
  for (const entry of interleaveConversationActivity(input)) {
    if (entry.kind === "turn") {
      open = null;
      stream.push(entry);
      continue;
    }
    if (entry.activity.detail?.kind === "note") continue;
    if (!open) {
      open = { key: `activity:${entry.activity.sequence}`, rows: [], activityId: entry.activity.activityId };
      stream.push({ kind: "activity", key: open.key, group: open });
    }
    open.rows.push(entry.activity);
    open.activityId = entry.activity.activityId;
  }
  return stream;
}

/** "2m 5s", "40s"; nothing under a second. From the group's own timestamps, never a running clock. */
export function conversationActivityDuration(rows: readonly ConversationActivity[]): string | null {
  if (rows.length < 2) return null;
  const seconds = Math.round((rows[rows.length - 1]!.atMs - rows[0]!.atMs) / 1_000);
  if (seconds < 1) return null;
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
