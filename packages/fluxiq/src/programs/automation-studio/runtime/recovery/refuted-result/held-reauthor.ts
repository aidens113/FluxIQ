// The re-author a run holds for its judged whole run (t267): which one is still
// waiting, and how its record is settled.
//
// Both re-author routes approve their extend-mode edit and hold it -- validated,
// unapplied -- instead of applying it inside the build
// (`./reauthor.ts`, `automationStudioReauthorRefutedResult`'s `hold`). The run's
// re-author marker says so (`held: true`), and these read and write that state:
// the re-run reads which held edit to run unapplied, a later attempt reads which
// earlier one it replaces, and the run's judged end writes `applied` or
// `notAppliedReason` (`service/runtime-adaptation/judged-reauthor.ts`).

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY } from "./reauthor.ts";

/**
 * The adaptation of this run's latest re-authoring when it is held and still
 * waiting -- approved, not applied, and not settled -- or nothing.
 */
export function automationStudioRefutedResultHeldReauthor(detail: AutomationStudioFlowRunDetail): string | undefined {
  const marker = reauthorMarker(detail);
  return marker && heldAndWaiting(marker) ? marker.adaptationId as string : undefined;
}

/**
 * Every re-author of this run still held and waiting, oldest first, by
 * adaptation id: each attempt's own record, and the latest's.
 */
export function automationStudioRefutedResultWaitingReauthors(detail: AutomationStudioFlowRunDetail): string[] {
  const ids = [...recordedAttempts(detail), reauthorMarker(detail) ?? {}].flatMap((entry) => (heldAndWaiting(entry) ? [entry.adaptationId as string] : []));
  return [...new Set(ids)];
}

/**
 * The run, with `fields` written onto the re-author record of `adaptationId`:
 * the latest when it is that adaptation's, and every attempt that built it.
 * How a held edit is settled -- `applied`, or why not -- and how a re-run that
 * had to apply it first says so.
 */
export function automationStudioRefutedResultReauthorMarked(detail: AutomationStudioFlowRunDetail, adaptationId: string, fields: JsonObject): AutomationStudioFlowRunDetail {
  const marker = reauthorMarker(detail);
  if (!marker) return detail;
  const attempts = Array.isArray(marker.attempts) ? marker.attempts : undefined;
  return {
    ...detail,
    metadata: {
      ...(detail.metadata ?? {}),
      [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: {
        ...marker,
        ...(marker.adaptationId === adaptationId ? fields : {}),
        ...(attempts ? { attempts: attempts.map((entry) => (isRecord(entry) && entry.adaptationId === adaptationId ? { ...entry, ...fields } : entry)) } : {})
      }
    }
  };
}

function heldAndWaiting(entry: JsonObject): boolean {
  return entry.held === true && entry.applied !== true && entry.notAppliedReason === undefined && typeof entry.adaptationId === "string";
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function reauthorMarker(detail: AutomationStudioFlowRunDetail): JsonObject | undefined {
  const marker = detail.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY];
  return isRecord(marker) ? marker : undefined;
}

function recordedAttempts(detail: AutomationStudioFlowRunDetail): JsonObject[] {
  const attempts = reauthorMarker(detail)?.attempts;
  return Array.isArray(attempts) ? attempts.filter(isRecord) : [];
}
