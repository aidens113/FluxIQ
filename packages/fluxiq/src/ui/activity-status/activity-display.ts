import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";

/**
 * The status a person sees, paced from Core's raw events by the background
 * (`background/activity/`). The overlay and the chat's live line render this and
 * nothing else, so both show the same words and neither can flicker faster
 * than the pacer lets it.
 *
 * - `headline` names the unit of work and stays put while it runs ("Building
 *   your Flow", "Running your Flow", "Fixing your Flow" once Core repairs
 *   it, "Testing your Flow" while a candidate build test-runs the Flow it
 *   submitted, which is never a repair); it changes only when the work changes, settles ("Flow ready", "Build
 *   failed", "Run finished", "Run failed", "Couldn't fix your Flow" for a run
 *   whose repair failed; a build that fails says "Build failed" even
 *   mid-repair) or needs the person ("Waiting for you: finish the check on
 *   the page", "Waiting for you: answer in the FluxIQ panel", "Paused: your
 *   turn on the page" while a run is held for the person). Those changes
 *   show at once (`background/activity/headline.ts`).
 * - `detail` is Core's latest event in a person's words (`activityWording`),
 *   never a tool id or result code, changed at most once per 1.6 s
 *   (`ACTIVITY_DETAIL_INTERVAL_MS`); the newest always shows once the
 *   interval ends, and a step that starts after a decision shows at once. It
 *   is null rather than a repeat of the headline (`isHeadlineEcho`). The
 *   overlay draws each display as it arrives; it has no pace of its own.
 * - `phase` and `step` are the phase and step of the event `detail` came
 *   from, so they change no faster than `detail` does.
 * - `kind` says what the newest event folded in was, so a reader keys on it
 *   rather than on the raw event riding beside the display: `action` for
 *   FluxIQ's own status; `thought` for the model's words (a reason, a refused
 *   edit: `isModelThought`), which never become the detail -- the display
 *   keeps the unit's last action line, phase and step -- and never count as a
 *   change of it; `starting` for the status put up the moment the person
 *   sends a message FluxIQ takes on, before Core's first activity
 *   (`background/activity/send-start.ts`). Absent reads as `action`.
 *
 * The background sends it on at most four times a second, and only when it
 * changed (`background/activity/activity-relay.ts`).
 */
export type ActivityDisplay = {
  /** `${subject.kind}:${subject.id}` of the unit of work, as in `ClientGatewayActivity.activityId`. */
  activityId: string;
  subjectKind: "build" | "run";
  phase: ClientGatewayActivityPhase;
  headline: string;
  detail: string | null;
  /** 1-based step of M, from the run's step events; kept between them and while a run is held (`paused`: the step it continues from), null for a build and once settled. */
  step: { index: number; count: number } | null;
  /** True while the work runs; false once it settled or while it waits for the person (`outcome` says which). */
  working: boolean;
  /**
   * Null while working; otherwise done, failed, or waiting for the person (which is not final: work may resume).
   * A run Core holds for the person (Take over) is `waiting` with `phase: "paused"`.
   */
  outcome: "done" | "failed" | "waiting" | null;
  /** The Core sequence of the newest event folded into this display; 0 for the starting status. */
  sequence: number;
  /** What the newest event folded in was; absent reads as `action`. */
  kind?: "action" | "thought" | "starting";
};
