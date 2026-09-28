// Browser-safe panel-capability vocabulary contract.
//
// The panel declares its capabilities; this is the shape they cross to Core in
// and the rendering a model is given. Keep the surface narrow and keep it free
// of anything that cannot run in a browser: no `node:` import, no store, no
// service, no gate. `tests/index.test.ts` pins both, and the package manifest
// publishes this file as `fluxiq/automation-studio/panel-capabilities`.
export type { AutomationStudioPanelCapability, AutomationStudioPanelCapabilityArgument } from "../capability.ts";
export { AUTOMATION_STUDIO_PANEL_CAPABILITY_MAX, parseAutomationStudioPanelCapabilities } from "../parse.ts";
export { automationStudioPanelCapabilityIds, automationStudioPanelCapabilityVocabulary } from "../vocabulary.ts";
