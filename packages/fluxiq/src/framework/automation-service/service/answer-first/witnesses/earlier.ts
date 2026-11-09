// What a new attempt's witnesses start from, where acts are carried into it (`./input.ts`, `earlier`).
//
//   a new attempt, carrying one attempt's acts   that attempt's before reading where it is held,
//                                                and where it is not, the judge is told so
//   a new attempt, carrying several attempts'    no one reading came before all of them (a person's
//   acts (`from` none)                           Run again read its own after the earlier acts), so
//                                                the judge is told so
//   a carry-on (`sameAttempt`)                   its own reading where it is held; where it is not,
//                                                it is not an earlier attempt's, and nothing is said
//   nothing carried                              nothing: the before side is read as it always was

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstBeforeReadings } from "./before-readings.ts";

export function automationStudioAnswerFirstEarlierBefore(
  readings: Pick<AutomationStudioAnswerFirstBeforeReadings, "get">,
  carried: { acts: boolean; from?: string | undefined; sameAttempt?: boolean | undefined }
): { before?: JsonObject } | undefined {
  const before = carried.from === undefined ? undefined : readings.get(carried.from);
  if (carried.sameAttempt) return before ? { before } : undefined;
  if (!carried.acts) return undefined;
  return before ? { before } : {};
}
