// Whether the patch ladder follows a refuted result, and the record of why not.
//
// The ladder repairs one failed step with runtime patches: a reroute, a call to
// a recovery subflow, or a few steps run at the step's node. A refuted result
// reached it twice where none of that could help, and each time it spent a
// diagnosis and a patch call to say so:
//
// - **The refutation names no step.** No step stored records, so the result
//   itself was judged and no step was found wrong (`attempt.ts`). Run 38
//   (`run-muqilf9s-c3211328`) and bigbox (`run-muqiojz4-04a7a8fc`) handed the
//   ladder a navigate and an "Add to cart" that had both worked.
// - **The re-author already explored, and built nothing.** A refutation's fix is
//   a change to the Flow's steps -- every finding's fix line is one
//   (`../../result-verification/repair-directive.ts`) -- which no runtime patch
//   makes. Run 38's re-author explored for eight decisions with the judge's fix
//   in hand (a read, a filter and a confirm for each row) and ended
//   `not_doable`; the ladder then answered `no_repair` under `control_gone`,
//   a reason that was not even true.
//
// A re-author that ended before its first decision -- refused before its
// request, no caller, a provider that never answered -- never tried the fix,
// so the ladder still follows it, as `run-mulxk0ro-36bf090d` required. A skip
// is written on the re-author marker beside what the re-author did, so
// "nothing more was tried" is a stated reason rather than a silence.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY } from "./reauthor.ts";

/** Why the patch ladder was not run for a refuted result, in codes a reader can key on. */
export type AutomationStudioRefutedResultLadderSkip = "names_no_step" | "structural_fix";

/**
 * The run with the skipped ladder recorded, or `undefined` when the ladder
 * runs. Call it on the run as the re-author route left it, so the marker it
 * writes into is that route's.
 */
export function automationStudioRefutedResultLadderSkipped(input: {
  detail: AutomationStudioFlowRunDetail;
  /** Whether the refutation names a step of the Flow (`automationStudioRefutedResultAttemptNamesNode`). */
  namesStep: boolean;
  /** Which repair of the run this is: only its own re-author builds are read. */
  attempt: number | undefined;
  /** The re-author's failure, when it ran and built nothing. */
  afterCode?: string | undefined;
}): AutomationStudioFlowRunDetail | undefined {
  const marker = reauthorMarker(input.detail);
  const reason: AutomationStudioRefutedResultLadderSkip | undefined = !input.namesStep ? "names_no_step" : explored(marker, input.attempt) ? "structural_fix" : undefined;
  if (!reason) return undefined;
  return {
    ...input.detail,
    metadata: {
      ...(input.detail.metadata ?? {}),
      [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: {
        ...marker,
        ladderSkipped: { reason, ...(input.afterCode ? { afterCode: input.afterCode } : {}) }
      }
    }
  };
}

/**
 * Whether a re-author build of this repair made a decision, read off the
 * attempts the run records. Any build counts, not only the last: a retry the
 * purse refused leaves the first build's exploring standing.
 */
function explored(marker: JsonObject, attempt: number | undefined): boolean {
  const attempts = Array.isArray(marker.attempts) ? marker.attempts : [];
  return attempts.some((recorded) => {
    if (!isObject(recorded) || recorded.attempt !== attempt) return false;
    const decisions = isObject(recorded.evidenceLoop) ? recorded.evidenceLoop.decisionCount : undefined;
    return typeof decisions === "number" && decisions > 0;
  });
}

function reauthorMarker(detail: AutomationStudioFlowRunDetail): JsonObject {
  const marker = detail.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY];
  return isObject(marker) ? marker : {};
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
