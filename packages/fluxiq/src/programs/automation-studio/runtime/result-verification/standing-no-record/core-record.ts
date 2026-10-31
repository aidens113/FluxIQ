// Core's own record of a no it made itself, with no judge asked (P5b): the
// computed facts that fail (`../computed-facts/computed-no.ts`). Built as a
// judge's no's record is -- the rows stored, the conditions read with, what each
// left out -- so the trial gate keeps the conditions Core's record settled
// (`../standing-no/kept-conditions.ts`) across the build's trials, and marked
// `source: "core"` and with the defects Core located, which are the facts' own.
// No judge called, so no standing call and no kind upheld.

import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultNoRecord } from "../refuted-no/index.ts";
import type { AutomationStudioRequestWording } from "../request-rows/index.ts";
import type { AutomationStudioResultStandingNoLocated, AutomationStudioResultStandingNoRecord } from "../standing-no/index.ts";
import { automationStudioResultStandingNoRecord } from "./record.ts";

/** Core's record of its own no over `summary` (header); `defects` are the failing facts' located defects. */
export function automationStudioResultStandingNoCoreRecord(input: {
  summary: AutomationStudioRunResultSummary;
  defects: readonly AutomationStudioResultStandingNoLocated[];
  wording?: AutomationStudioRequestWording | undefined;
  requestText?: string | undefined;
}): AutomationStudioResultStandingNoRecord {
  const { summary, wording, requestText } = input;
  const record = automationStudioResultNoRecord({ summary, requestText, wording });
  const base = automationStudioResultStandingNoRecord({ calls: [], record, summary, wording });
  const located = input.defects.map((defect) => ({
    kind: defect.kind, row: defect.row,
    ...(defect.column !== undefined ? { column: defect.column } : {}),
    ...(defect.value !== undefined ? { value: defect.value } : {}),
    ...(defect.step !== undefined ? { step: defect.step } : {})
  }));
  return { ...base, source: "core", ...(located.length ? { located } : {}) };
}
