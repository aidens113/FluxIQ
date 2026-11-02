// Compatibility exports; the framework owns this implementation.
export {
  AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION,
  AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX,
  automationStudioActionPermissionSentence,
  parseAutomationStudioActionPermissionRequest,
  isAutomationStudioActionPermissionCarriedName
} from "../../../../runtime/action-permissions/index.ts";
export type {
  AutomationStudioActionPermissionStage,
  AutomationStudioActionPermissionActionKind,
  AutomationStudioActionPermissionAction,
  AutomationStudioActionPermissionRequest
} from "../../../../runtime/action-permissions/index.ts";
