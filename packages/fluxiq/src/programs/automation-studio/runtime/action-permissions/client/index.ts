// Browser-safe action-permission display contract. Keep this surface narrow:
// it deliberately excludes the runtime gate, declaration and instruction
// authority modules used to decide permissions on the server.
export { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES } from "../consequences.ts";
export { parseAutomationStudioActionPermissionRequest, type AutomationStudioActionPermissionRequest } from "../request.ts";
