"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import { deleteFlowMapRoute, deleteFlowMapRouteGroup, mutateFlowMapRoute, saveFlowMapFallback, saveFlowMapRoute, saveFlowMapRouteGroup } from "./router-commands";
import { getFlowRouterSummary, getRouterGraphSummary, listRouterRoutes, listRouterSubflowTargets, testFlowMapRouteCondition } from "./router-queries";
export type RouterViewHostModel = {
  projectId: string | null;
  flow: any;
  initialRouter?: any;
  initialSubflows?: any[];
};

export type RouterViewHostCommands = {
  onCreateSubflow?(): void;
};

export type RouterCommands = {
  loadRouter(payload: Record<string, any>): ReturnType<typeof getFlowRouterSummary>;
  listRoutes(payload: Record<string, any>): ReturnType<typeof listRouterRoutes>;
  listSubflows(payload: Record<string, any>): ReturnType<typeof listRouterSubflowTargets>;
  loadGraphSummary(payload: Record<string, any>): ReturnType<typeof getRouterGraphSummary>;
  testCondition(payload: Record<string, any>): ReturnType<typeof testFlowMapRouteCondition>;
  saveRoute(payload: Record<string, any>): ReturnType<typeof saveFlowMapRoute>;
  deleteRoute(payload: Record<string, any>): ReturnType<typeof deleteFlowMapRoute>;
  saveGroup(payload: Record<string, any>): ReturnType<typeof saveFlowMapRouteGroup>;
  deleteGroup(payload: Record<string, any>): ReturnType<typeof deleteFlowMapRouteGroup>;
  saveFallback(payload: Record<string, any>): ReturnType<typeof saveFlowMapFallback>;
  mutateRoute(payload: Record<string, any>): ReturnType<typeof mutateFlowMapRoute>;
};

export function useRouterCommands(): RouterCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    loadRouter: (payload) => getFlowRouterSummary(transport, payload),
    listRoutes: (payload) => listRouterRoutes(transport, payload),
    listSubflows: (payload) => listRouterSubflowTargets(transport, payload),
    loadGraphSummary: (payload) => getRouterGraphSummary(transport, payload),
    testCondition: (payload) => testFlowMapRouteCondition(transport, payload),
    saveRoute: (payload) => saveFlowMapRoute(transport, payload),
    deleteRoute: (payload) => deleteFlowMapRoute(transport, payload),
    saveGroup: (payload) => saveFlowMapRouteGroup(transport, payload),
    deleteGroup: (payload) => deleteFlowMapRouteGroup(transport, payload),
    saveFallback: (payload) => saveFlowMapFallback(transport, payload),
    mutateRoute: (payload) => mutateFlowMapRoute(transport, payload)
  }), [transport]);
}
