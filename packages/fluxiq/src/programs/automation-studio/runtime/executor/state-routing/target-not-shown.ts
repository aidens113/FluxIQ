// A step whose control was measured on the page but not shown (t661).
//
// A8 bigbox cart (`run-mvac0ddx-f52ba929`): the store picker a step had opened
// was closed again before the step that used it, so that step's control stayed
// in the page with no box. The domain reported it under the same failure
// category as a control that is not there at all (`target_not_found`), and Core
// told the model the step's control "could not be found ... the step is right,
// test again" (`../../service/candidate-trial/target-on-page.ts`) and routed
// nowhere. The control was found; a step before it had to show it.
//
// So the domain says so on the measurement it already returns beside the
// action result (`outputs.result.result.resolution`, closed words and numbers
// only): `shown: false` when the control it resolved is on the page and not
// shown. Core reads only that field, structurally. Any other shape -- a domain
// that does not report it yet, a `shown` that is not exactly `false` -- reads
// as not measured, and the step keeps what it had before. Core learns no
// domain failure code for it.

import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/**
 * Whether a failed attempt's control was measured on the page but not shown:
 * failed as `target_not_found`, with the domain's resolution beside its result
 * saying `shown: false` (header).
 */
export function automationStudioTargetMeasuredNotShown(attempt: Pick<AutomationStudioNodeAttemptTrace, "status" | "failure"> & { outputs?: AutomationStudioNodeAttemptTrace["outputs"] | undefined }): boolean {
  if (attempt.status !== "failed" || attempt.failure?.category !== "target_not_found") return false;
  return objectAt(attempt.outputs, "result", "result", "resolution")?.shown === false;
}

function objectAt(value: unknown, ...path: string[]): Readonly<Record<string, unknown>> | undefined {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current && typeof current === "object" && !Array.isArray(current) ? current as Readonly<Record<string, unknown>> : undefined;
}
