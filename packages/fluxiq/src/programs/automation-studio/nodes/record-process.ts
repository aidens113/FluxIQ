// The record-processing readers, re-exported by name so browser code judges a
// `where` condition, reads a number or a date, dedupes and sorts with Core's own
// functions rather than a copy kept equal by a parity test (t728, lane S; audit
// findings 4B/4C). The extension content script and the domain reach
// `@fluxiq/contracts` only through `fluxiq` subpaths, and this one is
// browser-safe: never route these through the `fluxiq/automation-studio`
// barrel, which pulls in `node:crypto`.
export {
  AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES,
  AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS,
  AUTOMATION_STUDIO_RECORD_SORT_ORDERS,
  AUTOMATION_STUDIO_RECORD_SORT_TYPES,
  AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES,
  automationStudioRecordAutoSortKind,
  automationStudioRecordConditionHolds,
  automationStudioRecordConditionPattern,
  automationStudioRecordRowIdentity,
  countAutomationStudioRecordUnsortableRows,
  readAutomationStudioRecordDate,
  readAutomationStudioRecordNumber,
  readAutomationStudioRecordSortValue,
  sortAutomationStudioRecordRows
} from "@fluxiq/contracts/automation-studio";
export type {
  AutomationStudioRecordCondition,
  AutomationStudioRecordConditionTest,
  AutomationStudioRecordConditionValue,
  AutomationStudioRecordSortKey,
  AutomationStudioRecordSortOrder,
  AutomationStudioRecordSortReading,
  AutomationStudioRecordSortType,
  AutomationStudioRecordValueReadingCase
} from "@fluxiq/contracts/automation-studio";
