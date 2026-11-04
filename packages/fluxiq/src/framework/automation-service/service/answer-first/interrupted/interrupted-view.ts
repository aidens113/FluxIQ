// How a row that nobody is working on any more reads (design, "Carry on and interrupted"): waiting
// to be carried on, with everything it held, and never `working`. Pure, and the caller has already
// asked whether the attempt is live.
//
// An attempt that returned waiting on a person-only check, with nobody to ask, did not get cut
// off. It said what it needs and stopped, so it stays as it is (`./check-missing.ts`).

import type { AutomationStudioTaskAttemptFields } from "@fluxiq/contracts/automation";
import type { AutomationStudioAnswerFirstAttemptRecord } from "../attempt-store/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING } from "./check-missing.ts";

/** The row as interrupted, or nothing where it should stay as it is. */
export function automationStudioAnswerFirstInterruptedView(record: AutomationStudioAnswerFirstAttemptRecord): AutomationStudioAnswerFirstAttemptRecord | undefined {
  const { attempt } = record;
  if (attempt.status !== "working" && attempt.status !== "waiting_for_person") return undefined;
  if (attempt.status === "waiting_for_person") {
    if (attempt.waitingFor === "interrupted") return undefined;
    if (attempt.waitingFor === "person_only_check" && record.result?.missingWhat?.includes(AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING)) return undefined;
  }
  const { status: _status, waitingFor: _waitingFor, ...held } = attempt as AutomationStudioTaskAttemptFields & { status: unknown; waitingFor?: unknown };
  return { ...record, attempt: { ...held, status: "waiting_for_person", waitingFor: "interrupted" } };
}
