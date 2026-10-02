/** A replay's result codes (`programs/automation-studio/runtime/llm/node-tools/replay.ts`, `AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES`). */
const REPLAY_PREFIX = "core.replay.";

/**
 * The replay codes that say the step held: it ran and did what it did before
 * (`replayed`), it was checked and could run (`verified`), its effect was
 * already in place (`present`), or its target was gone from the very page it
 * acted on because the site remembered the choice (`remembered`). A dry run of
 * live run `run-muqiojz4-04a7a8fc` showed "Set as my store" and four more
 * steps red, "it didn't work the same way again", on `remembered`.
 */
const HELD: ReadonlySet<string> = new Set(["core.replay.replayed", "core.replay.verified", "core.replay.present", "core.replay.remembered"]);

/**
 * True for a replay's result code that says the step did not hold on the
 * second time (`failed`, `changed`, `unreproducible`, `reset_failed`, or any
 * replay code not known to hold); false for one that held, and for any code
 * that is not a replay's. Read by the chat's cards and by Core's activity
 * wording, so the two never disagree.
 */
export function activityActionReplayFailing(resultCode: string): boolean {
  const code = resultCode.trim().toLowerCase();
  return code.startsWith(REPLAY_PREFIX) && !HELD.has(code);
}
