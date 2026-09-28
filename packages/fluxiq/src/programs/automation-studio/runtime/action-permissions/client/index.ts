// Browser-safe action-permission display contract. Keep this surface narrow:
// it deliberately excludes the runtime gate, declaration and instruction
// authority modules used to decide permissions on the server.
//
// **Which classes still stop for a person is published here, not restated.**
// `destructive.ts` decides it, and until 2026-09-28 that decision was not on
// this barrel, so the panel carried its own copy of the two gated classes with
// a test pinning the copy. Two lists of what asks a person is one list too
// many: Core could narrow or widen its gate and the browser would go on showing
// the old answer, with every test on both sides green. `destructive.ts` imports
// nothing but `consequences.ts`, so publishing the constant costs the browser
// nothing.
export { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES } from "../consequences.ts";
export { AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "../destructive.ts";
export { parseAutomationStudioActionPermissionRequest, type AutomationStudioActionPermissionRequest } from "../request.ts";
