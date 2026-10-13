/**
 * Each skip reason a `step` row carries (`ClientGatewayActivitySkip.reason`,
 * `@fluxiq/contracts`), in the words a card shows in place of "Done". A step
 * passed over because what it acts on was not shown read "Click · close ...
 * if it shows -- Done" while the status line beside it said "Skipped ...: it
 * was not shown" (round 12, lane D, `run-mv62icw0-070f88ad`). The words say
 * it was skipped and why, as `./tested.ts` says it of a test's excused step.
 */
const SKIP_WORDS: Readonly<Record<string, string>> = {
  optional_absent: "Skipped: not there, optional",
  state_routed: "Skipped: the page was already at another step",
  already_done: "Skipped: already done in this run"
};

/**
 * What a skipped step's card says in place of "Done", from the row's closed
 * `skipped.reason`, or null for a row that carries none or a reason this does
 * not know (an additive reason from a newer Core reads as a plain step).
 */
export function activityActionSkipped(skipped: { reason?: unknown } | undefined): string | null {
  const reason = typeof skipped?.reason === "string" ? skipped.reason : undefined;
  return reason !== undefined && Object.prototype.hasOwnProperty.call(SKIP_WORDS, reason) ? SKIP_WORDS[reason]! : null;
}
