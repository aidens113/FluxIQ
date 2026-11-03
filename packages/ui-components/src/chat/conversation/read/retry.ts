// How patiently the chat reads again after a failed read (`../controller.ts`),
// and the clock it waits with.
//
// A single failure during a build is usually gone a second later, so the chat
// reads again quietly and says nothing. The notice shows only when reading has
// failed at least `noticeAfterFailures` times in a row over at least
// `noticeAfterMs`: with the retries below and the 4 s poll that is about six
// to seven seconds of failing, never one bad answer.

/** The chat's read-retry timing. */
export const READ_RETRY = {
  /** Quiet re-reads after a failure, in order; none after the last until a read succeeds or the person presses Retry. */
  delaysMs: [1_000, 2_000, 4_000] as readonly number[],
  noticeAfterFailures: 3,
  noticeAfterMs: 6_000
} as const;

/** What the controller reads time from and waits with; a test passes its own. */
export type ConversationClock = {
  now(): number;
  /** Runs `run` after `ms`; answers a cancel. */
  schedule(run: () => void, ms: number): () => void;
};
