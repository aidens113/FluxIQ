// How often the chat reads on its own timer, if at all.
//
// A client whose change feed is complete (`ChatChangesPort.complete`: it tells
// of every change, whoever made it, and once whenever it may have missed one)
// gets no poll: the chat reads when told. Otherwise the poll stays even beside
// a change feed: a turn written by a server-side run reaches a client with no
// push channel in no other way, so with a feed it only slows to a ceiling. In
// the background (the chat window is collapsed) only the thread list is read,
// on its own beat, whether or not the tab is visible, because the badge is the
// one thing that can tell a person a question arrived.

import type { ChatChangesPort } from "./ports/index.ts";

const READ_BEAT_MS = 4_000;
const CONVERSATION_POLL_CEILING_MS = 10_000;
const BACKGROUND_BEAT_MS = 5_000;

/** The wait between reads, or null for none: `background` when only the thread list is read, `changes` the client's change feed. */
export function readBeatMs(background: boolean, changes: ChatChangesPort | undefined): number | null {
  if (changes?.complete === true) return null;
  if (background) return BACKGROUND_BEAT_MS;
  return changes !== undefined ? CONVERSATION_POLL_CEILING_MS : READ_BEAT_MS;
}
