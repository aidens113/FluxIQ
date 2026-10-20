// Where the client gateway trace episodes meet the rest of Automation Studio
// (traces and offline trials, P2, D9-D11): the host wiring
// (`programs/_shared/runtime.ts`), the service's build and run entries, the
// trial ports, the persisted store over the service's own pool, and the
// recorded candidate start hook. Kept out of `../index.ts`, which the HTTP
// handlers and the parking port read, so they do not load all of this.
export { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTEXT } from "./context-schemas.ts";
export { automationStudioGatewayTraceBuildId } from "./build-id.ts";
export { automationStudioGatewayTraceConversationContext } from "./conversation-turn.ts";
export { automationStudioGatewayTraceStartHook } from "./start-hook.ts";
export { automationStudioGatewayTraceStoredInstructions } from "./stored-instructions.ts";
export { AutomationStudioGatewayTraceProjectStore } from "./project-store.ts";
export { AutomationStudioGatewayTraceServicePools } from "./service-pools.ts";
export { bindAutomationStudioGatewayTraceRun } from "./run-bind.ts";
export { createAutomationStudioGatewayTraceHost } from "./host.ts";
export type * from "./types.ts";
export { withAutomationStudioGatewayTraceBuildActivity } from "./build-activity.ts";
export { withAutomationStudioGatewayTraceRunActivity } from "./run-activity.ts";
export { withAutomationStudioGatewayTraceTrial } from "./trial.ts";
