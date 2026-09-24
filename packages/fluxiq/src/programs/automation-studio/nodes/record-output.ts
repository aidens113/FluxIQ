// The record-set contract behind the `record-output` parameter control, re-exported
// by name so the web panel's record-output editor can validate a draft with the
// same parser, bounds, and option lists the node runs with (K1, `k12-data-view`
// §4.3). Browser code reaches `@fluxiq/contracts` only through `fluxiq` subpaths.
export {
  AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS,
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS,
  AUTOMATION_STUDIO_RECORD_VALUE_TYPES,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  parseAutomationStudioRecordOutput,
  // A domain that produces rows can check them against the schema it means to
  // declare, with the function the capture will validate them with rather than
  // a reading of the rules. Without it, a schema its own rows cannot satisfy is
  // only discoverable by running a Flow and finding the dataset empty, which is
  // how `core.result.every_record_refused` was first measured.
  validateAutomationStudioRecords
} from "@fluxiq/contracts/automation-studio";
export type {
  AutomationStudioRecordField,
  AutomationStudioRecordFieldHandling,
  AutomationStudioRecordOutput,
  AutomationStudioRecordOutputParseResult,
  AutomationStudioRecordParseOptions,
  AutomationStudioRecordSchema,
  AutomationStudioRecordValidationOptions,
  AutomationStudioRecordValidationResult,
  AutomationStudioRecordValueType,
  AutomationStudioRecordWriteMode
} from "@fluxiq/contracts/automation-studio";
