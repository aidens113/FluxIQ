// Barrel for the durable state a registered domain keeps per build or per Flow
// (t728): the store the service owns, the accessor a domain reaches it through,
// its bounds and its refusal.
export { automationStudioDomainBuildState } from "./accessor.ts";
export { AUTOMATION_STUDIO_DOMAIN_BUILD_STATE_LIMITS } from "./limits.ts";
export { AutomationStudioDomainBuildStateRefusal } from "./refusal.ts";
export { AutomationStudioDomainBuildStateStore } from "./store.ts";
export type { AutomationStudioDomainBuildState, AutomationStudioDomainBuildStateScope } from "./types.ts";
