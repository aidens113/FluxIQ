import type { ProgramCommandTransport } from "../data/program-transport";
export function getFlowRouter(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("get-flow-router", payload); }
export function listRouterSubflows(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ subflows?: any[]; page?: { subflows?: any[] } }>("list-flow-subflows", payload); }
export function testFlowMapRouteCondition(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ matched?: boolean; reason?: string }>("test-flow-map-route-condition", payload); }
