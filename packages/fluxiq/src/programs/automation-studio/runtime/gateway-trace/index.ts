// Automation Studio's client gateway trace episodes (traces and offline
// trials, P2; named "gateway-trace", not "trace", which names the executor's
// files, D2): the episodes and their async-context capture source, the
// registry HTTP run control routes through, the screening sink that keeps
// secrets out of stored traces, and the switch that turns tracing on.
export { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL } from "./control-vocabulary.ts";
export { AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_ENV } from "./environment.ts";
export { AutomationStudioGatewayTraceEpisodes } from "./episodes.ts";
export { AutomationStudioGatewayTraceInstallation } from "./installation.ts";
export { automationStudioClientGatewayTraceEnabled } from "./from-environment.ts";
export type { AutomationStudioGatewayTraceOpenEpisode } from "./open-episode.ts";
export { screenAutomationStudioGatewayTracePayload } from "./payload-screen.ts";
export type { AutomationStudioGatewayTraceRegistry } from "./registry.ts";
export { AutomationStudioGatewayTraceScreeningSink } from "./screening-sink.ts";
export type * from "./types.ts";
