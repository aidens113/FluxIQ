// The chat's message stream as data: Core's thread turns and FluxIQ's step
// messages (`stepMessages`) on one timeline. No DOM, no folds: every step is
// its own message, where it happened.
//
// What the person asked a build is their message even when it never passed
// through this thread: a build started from FluxIQ, an automation's settings
// or a test harness reads its instruction from the Flow, and the chat showed
// FluxIQ working on a request nobody could see (live runs 34 and 35). A build
// says the person's words on its activity (`request`); each becomes a turn of
// theirs where the build said it, unless the thread already holds those words
// from them -- a request typed into this chat is not shown twice.
//
// Order. By time: a turn's from the turn clock, a step message's from the
// event that opened it (an unreadable `at` takes the message before it, so the
// relay's order holds). On equal times a turn goes first, then everything in
// its own order. A message's time never changes, so once placed it stays put.

import type { ClientGatewayActivity } from "fluxiq/ui";
import type { CoreTurn } from "../conversation/index.ts";
import { stepMessages, type StepMessage } from "./step/index.ts";
import type { StampedTurn } from "./turn-clock.ts";

/** The most step messages the chat keeps, the newest: several long builds' worth. */
export const CHAT_STEP_MESSAGE_LIMIT = 1_000;

/** One item of the stream. */
export type ChatStreamItem =
  | { kind: "turn"; key: string; at: number; turn: CoreTurn }
  | { kind: "step"; key: string; at: number; message: StepMessage };

/** The chat, top to bottom. */
export type ChatStream = { items: ChatStreamItem[] };

/** The stream for `turns` and the activity `events` the chat on screen shows (oldest first). */
export function buildChatStream(
  turns: readonly StampedTurn[],
  events: readonly ClientGatewayActivity[],
  limit = CHAT_STEP_MESSAGE_LIMIT
): ChatStream {
  const items: ChatStreamItem[] = [
    ...turns.map(({ turn, at }): ChatStreamItem => ({ kind: "turn", key: `turn:${turn.turnId}`, at, turn })),
    ...requestTurns(turns, events),
    ...stepMessages(events, limit).map((message): ChatStreamItem => ({ kind: "step", key: message.key, at: message.at, message }))
  ];
  // Array sort is stable: equal times keep turns first, each in its own order.
  items.sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? -1 : 1));
  return { items };
}

/** Each unit of work's first `request` as the person's turn, where the thread does not already hold their words. */
function requestTurns(turns: readonly StampedTurn[], events: readonly ClientGatewayActivity[]): ChatStreamItem[] {
  const said = new Set(turns.filter(({ turn }) => turn.author === "person").map(({ turn }) => sameWords(turn.text)));
  const asked = new Map<string, ChatStreamItem>();
  let lastAt = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    const parsed = Date.parse(event.at);
    const at = Number.isFinite(parsed) ? parsed : lastAt;
    lastAt = at;
    const text = typeof event.request === "string" ? event.request.trim() : "";
    if (!text || asked.has(event.activityId) || said.has(sameWords(text))) continue;
    const turnId = `request:${event.activityId}`;
    asked.set(event.activityId, { kind: "turn", key: `turn:${turnId}`, at, turn: { turnId, author: "person", text, ask: null, createdAt: at } });
  }
  return [...asked.values()];
}

/** Words compared as a person reads them: spacing and line breaks aside. */
function sameWords(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
