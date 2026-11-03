// How often the chat reads on its own timer.
//
// The poll stays even when the client tells the chat of each change
// (`transport.changes`): a turn written by a server-side run reaches a panel
// with no push channel in no other way. With the change feed the poll only
// has to catch what the feed cannot, so it slows to a ceiling. In the
// background (the chat window is collapsed) only the thread list is read, on
// its own beat, whether or not the tab is visible, because the badge is the one
// thing that can tell a person a question arrived.

const READ_BEAT_MS = 4_000;
const CONVERSATION_POLL_CEILING_MS = 10_000;
const BACKGROUND_BEAT_MS = 5_000;

/** The wait between reads: `background` when only the thread list is read, `changes` when the client pushes changes. */
export function readBeatMs(background: boolean, changes: boolean): number {
  if (background) return BACKGROUND_BEAT_MS;
  return changes ? CONVERSATION_POLL_CEILING_MS : READ_BEAT_MS;
}
