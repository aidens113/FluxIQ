// A step the saved Flow's routing passed over is Core's own record of a routing decision, never page evidence (t1053).
//
// Run `run-mwwwf7pb-c646fefb`: attempt 2 ran attempt 1's saved Flow, whose cover steps (a banner, a close, a "no thanks")
// were passed over because their targets were already gone. Core's own rule allows that
// (`framework/.../answer-first/completion/replay-stands.ts`), and the judge said yes. The trail still handed each
// passed-over step, with empty outputs, to the host's projector, which named it a gap
// (`web_judge.evidence_unrecognized`); Core holds every yes unsure while a gap stands, and the gaps stayed in the
// attempt's trail, so no completion could ever be accepted and the attempt ended only on its budget.
//
// The step is not handed to the host. It reaches the judge in Core's own words, as the whole run's trail does (the
// judge still sees every step), and it raises no gap. A step that ran, failed or produced outputs is still the host's
// to project (`../run-trail/of/attempts.ts`). The words name no site, task or thing.

import type { JsonValue } from "../../../core/index.ts";

/** The words of the note, by why the step was passed over. */
export const AUTOMATION_STUDIO_JUDGE_PASSED_OVER_WORDS = {
  /** What the step was to act on was not there when the Flow reached it. */
  targetAbsent: "The saved Flow passed over this step: what it was to act on was not there when the Flow reached it, so nothing was done and nothing was read. That is the Flow's own routing, not a reading of the page.",
  /** Any other routing decision that passed the step over. */
  routed: "The saved Flow passed over this step by its own routing, so nothing was done and nothing was read. That is the Flow's own routing, not a reading of the page."
} as const;

/** The finding for a passed-over step: Core's words as an observation, with no gap. */
export function automationStudioJudgePassedOverFinding(skipped: unknown): { version: 1; role: "observation"; evidence: JsonValue; missing: string[]; withheld: false } {
  const reason = skipped !== null && typeof skipped === "object" && !Array.isArray(skipped) ? (skipped as Record<string, unknown>).reason : undefined;
  const note = reason === "target_absent" ? AUTOMATION_STUDIO_JUDGE_PASSED_OVER_WORDS.targetAbsent : AUTOMATION_STUDIO_JUDGE_PASSED_OVER_WORDS.routed;
  return { version: 1, role: "observation", evidence: { note }, missing: [], withheld: false };
}
