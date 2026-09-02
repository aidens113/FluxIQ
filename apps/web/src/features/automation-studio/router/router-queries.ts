import type { ProgramCommandTransport } from "../data/program-transport";
/** Compatibility transport for integrations migrating during the two-release paging window. */
export function getFlowRouterSummary(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("get-flow-router-summary", payload); }
export function listRouterRoutes(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ routes?: any[]; groups?: any[]; page?: { routes?: any[]; counts?: { total?: number; active?: number; disabled?: number; byGroup?: Record<string, number> }; limit?: number; nextCursor?: string | null; hasMore?: boolean } }>("list-flow-router-routes", payload); }
export function listRouterSubflowTargets(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ subflows?: any[]; page?: { subflows?: any[]; total?: number; limit?: number; nextCursor?: string | null; hasMore?: boolean } }>("list-flow-subflow-targets", payload); }
export function getRouterGraphSummary(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ graph?: any }>("get-flow-router-graph-summary", payload); }
export function testFlowMapRouteCondition(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ matched?: boolean; reason?: string }>("test-flow-map-route-condition", payload); }
