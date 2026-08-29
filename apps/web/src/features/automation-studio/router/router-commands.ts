import type { ProgramCommandTransport } from "../data/program-transport";
export function saveFlowMapRoute(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("save-flow-map-route", payload); }
export function deleteFlowMapRoute(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("delete-flow-map-route", payload); }
export function saveFlowMapRouteGroup(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("save-flow-map-route-group", payload); }
export function deleteFlowMapRouteGroup(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("delete-flow-map-route-group", payload); }
export function saveFlowMapFallback(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("save-flow-map-fallback", payload); }
export function mutateFlowMapRoute(api: ProgramCommandTransport, payload: Record<string, any>) { return api.post<{ router?: any }>("mutate-flow-map-route", payload); }
