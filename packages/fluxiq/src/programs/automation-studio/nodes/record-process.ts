// The record-processing readers, re-exported by name so browser code judges a
// `where` condition, reads a number or a date, dedupes and sorts with Core's own
// functions rather than a copy kept equal by a parity test (t728, lane S; audit
// findings 4B/4C). The extension content script and the domain reach
// `@fluxiq/contracts` only through `fluxiq` subpaths, and this one is
// browser-safe: never route these through the `fluxiq/automation-studio`
// barrel, which pulls in `node:crypto`. The date condition readers and their
// parity table (t800, K1) are here for the same reason: a domain's grammar asks
// Core whether a bound or a `within` names a date, and runs the shared cases.
export {
  AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  AUTOMATION_STUDIO_RECORD_CONDITION_DATE_CASES,
  AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES,
  AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS,
  AUTOMATION_STUDIO_RECORD_CONDITION_WITHIN_UNITS,
  AUTOMATION_STUDIO_RECORD_SORT_ORDERS,
  AUTOMATION_STUDIO_RECORD_SORT_TYPES,
  AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES,
  automationStudioRecordAutoSortKind,
  automationStudioRecordConditionComparesDates,
  automationStudioRecordConditionHolds,
  automationStudioRecordConditionPattern,
  automationStudioRecordRowIdentity,
  countAutomationStudioRecordUnsortableRows,
  readAutomationStudioRecordConditionDateBound,
  readAutomationStudioRecordConditionWithin,
  readAutomationStudioRecordDate,
  readAutomationStudioRecordNumber,
  readAutomationStudioRecordSortValue,
  sortAutomationStudioRecordRows
} from "@fluxiq/contracts/automation-studio";
export type {
  AutomationStudioRecordCondition,
  AutomationStudioRecordConditionDateCase,
  AutomationStudioRecordConditionTest,
  AutomationStudioRecordConditionValue,
  AutomationStudioRecordSortKey,
  AutomationStudioRecordSortOrder,
  AutomationStudioRecordSortReading,
  AutomationStudioRecordSortType,
  AutomationStudioRecordValueReadingCase
} from "@fluxiq/contracts/automation-studio";
