// What a dry run says about a step the site remembers, and about a step it
// first looked for on another page.
//
// **The defect this closes.** The dry run is the judgement phase, and it runs
// on the site state exploration left. Its reset is a navigation and nothing
// more (decision D1, `./verify-only.ts`), so whatever the site remembers stays
// remembered: a consent banner declined, a "Not now" pressed, a sign-in wall
// passed as a guest, a cart the real order emptied. A step that did one of
// those can never replay, and every completion was refused for it:
//
//   - confirm-requests, run 33 (`run-munwwkwq-064c4203`): `d3`, the consent
//     press on the home page, came back unreproducible in both dry runs, and
//     the build ended at the no-progress guard (t195-w19a, B1);
//   - pickup-order: "Continue to checkout" on a cart the real order emptied,
//     the sign-in wall's "Continue without an account", and the slots' Retry
//     (t195-w19b, #1 and #2);
//   - apply-quillmark: "I'm a person" and the confirmation read after a
//     withheld Submit (t195-w19d, C4);
//   - moon-jar: the cookie decline, notifications "Not Now" and the dock
//     collapse (t195-w19e, risk 2).
//
// The judged playback runs on a reset site, which has not seen any of it, and
// needs every one of those steps. Dropping them -- which the refusal used to
// offer -- builds a Flow that stops at the wall the first time it runs.
//
// **remembered.** A step the dry run presses (not one it only checks) whose
// target is gone while the replay stands on the very page the step acted on:
// the site remembers what it did. The host decides it from the step's own
// `replay.from`, sent with the call, exactly as it decides `present` for a
// checked step (`./verify-only.ts`). It does not block, and the step stays in
// the Flow unchanged, so a fresh visit still runs it.
//
// It is not made `optional` here. Whether a missing control was an
// interruption that only sometimes appears (a dialog layer) or a step of the
// page the Flow always needs is a fact about the press, not the replay, and
// the host now records it at press time: a press that answered a layer gone
// after it carries `interruption` (`./step.ts`). Such a step, with no act and
// no routing of its own, is optional wherever the Flow is written
// (`./sometimes-present.ts`, `automationStudioFlowDraftInterruptionStepIds`),
// so a remembered dismissal is skipped in playback rather than marked here.
//
// **reanchored.** A step whose target is missing while the replay stands on a
// page other than its own, right after a step that was not done again --
// checked (verified or present), remembered, or excused -- is not judged on
// the wrong page. The step before it left the page where the exploration's
// step did not, so the dry run goes to the step's own `replay.from` once (the
// same reset the replay starts with) and asks again there. The outcome keeps
// that second answer and says it was reanchored. A step still missing on its
// own page is then `remembered`, or `present` for a checked one; a step looked
// for only on another page is never passed. Only the step right before counts:
// a draft whose earlier steps were withdrawn, so a later step replays on a
// page it never acted on (run 18, `run-munpwa5r-e7aefe04`), still blocks.

/** The code a host answers a replayed step with when its target is gone from the page it acted on. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REMEMBERED_CODE = "core.replay.remembered";

/** The code Core records on a step it looked for on another page first and asked again on its own. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_REANCHORED_CODE = "core.replay.reanchored";
