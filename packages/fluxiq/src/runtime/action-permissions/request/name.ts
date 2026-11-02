import { AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX } from "./limit.ts";

/** Whether a name is one a request may carry: plain, bounded, and nothing markup could hide in. */
export function isAutomationStudioActionPermissionCarriedName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX
    && value === value.trim() && !/[\u0000-\u001f\u007f<>]/u.test(value);
}
