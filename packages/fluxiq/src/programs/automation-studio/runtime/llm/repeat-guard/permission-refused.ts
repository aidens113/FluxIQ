// Whether a call refused as a repeat was refused, the first time, for want of
// a person's permission (t471).
//
// **Why.** Lane B round 9 (`run-mv5q4j33-d04ac463`) pressed a remove control
// declaring `delete`; the permission gate refused it (`permission_required`,
// the person had declined), and the model sent the same call three more times.
// Each was refused as a repeat with the note every failed call gets -- "use a
// different control or a different input" -- which never said the call could
// not be made at all without a person's yes, and the build ended. A permission
// refusal is the gate's own word (`../../action-permissions/`), whichever
// domain carried it: its code ends in `permission_required`.

import type { AutomationStudioLlmEvidenceRepeatedOutcome } from "./outcomes.ts";

const PERMISSION_REFUSED = /(?:^|[._])permission_required$/u;

/** Whether `earlier` failed because the permission gate refused what it would do. */
export function automationStudioLlmEvidenceRepeatPermissionRefused(earlier: AutomationStudioLlmEvidenceRepeatedOutcome): boolean {
  return earlier.outcome === "failed" && typeof earlier.resultCode === "string" && PERMISSION_REFUSED.test(earlier.resultCode);
}
