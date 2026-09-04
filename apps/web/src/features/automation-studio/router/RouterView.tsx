"use client";

import { EmptyState, StatusText } from "../../programs/shared-ui";
import { useEffect, useMemo, useRef, useState } from "react";


import { subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";
import { useRouterCommands, type RouterCommands } from "./router-host";
import { commitAutomationStudioMutation } from "../stores/mutation-transaction-store";
import { buildFlowMapRouteTestPayload, defaultFlowMapRouteDraft, flowMapConditionExpected, flowMapConditionSummary, flowMapRouteDraftFromRule, flowMapRouteGroupsFromRouter, nextFlowMapGroupOrder } from "./route-condition-model";
import { RouterContentView, ROUTER_ROUTE_PAGE_SIZE } from "./RouterContentView";


type InitialRouterRoutePage = { routes: any[]; counts: { total: number; active: number; disabled: number; byGroup: Record<string, number> }; nextCursor: string | null; hasMore: boolean };
export type RouterViewProps = { projectId: string | null; flow: any; initialRouter?: any; initialRoutePage?: InitialRouterRoutePage; initialSubflows?: any[]; onCreateSubflow?(): void };

export function RouterView(props: RouterViewProps) {
  const commands = useRouterCommands();
  return <RouterViewContent {...props} commands={commands} />;
}

export function RouterViewContent(props: RouterViewProps & { commands: RouterCommands }) {
  const flowId = props.flow?.flowId;
  const isSubflowGraph = props.flow?.metadata?.subflowGraph === true || typeof props.flow?.metadata?.parentFlowId === "string";
  const [flowMap, setFlowMap] = useState<any | null>(() => props.initialRouter ?? null);
  const [subflows, setSubflows] = useState<any[]>(() => props.initialSubflows ?? []);
  const [subflowTotal, setSubflowTotal] = useState(props.initialSubflows?.length ?? 0);
  const [subflowQuery, setSubflowQuery] = useState("");
  const [subflowsLoading, setSubflowsLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const [routePageIndex, setRoutePageIndex] = useState(0);
  const [routeCursors, setRouteCursors] = useState<Array<string | null>>([null]);
  const [routeQuery, setRouteQuery] = useState("");
  const [routeStatus, setRouteStatus] = useState<"all" | "active" | "disabled">("all");
  const [routePage, setRoutePage] = useState<InitialRouterRoutePage>(() => props.initialRoutePage ?? { routes: [], counts: { total: 0, active: 0, disabled: 0, byGroup: {} }, nextCursor: null, hasMore: false });
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [routeDraft, setRouteDraft] = useState(() => defaultFlowMapRouteDraft());
  const [groupDraft, setGroupDraft] = useState({ groupId: "", name: "", description: "", order: 0, collapsed: false, status: "active" });
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [fallbackModalOpen, setFallbackModalOpen] = useState(false);
  const [fallbackDraft, setFallbackDraft] = useState({ kind: "subflow" as "subflow" | "fail", targetSubflowId: "", message: "" });
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeTestValue, setRouteTestValue] = useState("");
  const [routeTestResult, setRouteTestResult] = useState<null | { matched: boolean; reason: string }>(null);
  const [testingRoute, setTestingRoute] = useState(false);
  const [authorization, setAuthorization] = useState<null | { action: "save-route" | "delete-route" | "save-group" | "delete-group" | "save-fallback" | "mutate-route" }>(null);
  const [authorizationPin, setAuthorizationPin] = useState("");
  const [routeMutation, setRouteMutation] = useState<null | { ruleId: string; action: "move_up" | "move_down" | "duplicate" | "toggle" | "delete" }>(null);
  const [loading, setLoading] = useState(() => Boolean(props.projectId && flowId && !isSubflowGraph && !props.initialSubflows?.length));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const scopeRef = useRef("");
  const routeGroups = useMemo(() => flowMapRouteGroupsFromRouter(flowMap), [flowMap]);
  const sortedRoutes = routePage.routes;
  const visibleRoutes = routePage.routes;
  const visibleRoutePage = routePage.routes;
  const routePageOffset = routePageIndex * ROUTER_ROUTE_PAGE_SIZE;
  const selectedRule = useMemo(() => sortedRoutes.find((route) => route.ruleId === selectedRuleId) ?? null, [sortedRoutes, selectedRuleId]);
  const activeSubflows = subflows;
  const subflowOptions = useMemo(() => activeSubflows.map((subflow) => ({ value: subflow.subflowId, label: subflow.name ?? subflow.subflowId, description: [subflow.description, subflow.role ? "Role: " + subflow.role : "", subflow.subflowId].filter(Boolean).join(" | ") })), [activeSubflows]);

  useEffect(() => {
    scopeRef.current = String(props.projectId ?? "") + ":" + String(flowId ?? "");
    setSelectedRuleId(null);
    setRouteDraft(defaultFlowMapRouteDraft());
    setRouteModalOpen(false);
    if (!props.projectId || !flowId || isSubflowGraph) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setRoutePageIndex(0);
    setRouteCursors([null]);
    void Promise.all([loadFlowMap(), loadRoutes(null), loadSubflows("")]).finally(() => setLoading(false));
  }, [props.projectId, flowId, isSubflowGraph]);
  useEffect(() => {
    if (!props.projectId || !flowId || isSubflowGraph) return;
    const timer = window.setTimeout(() => {
      setRoutePageIndex(0);
      setRouteCursors([null]);
      void loadRoutes(null);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [selectedGroupId, routeQuery, routeStatus]);
  useEffect(() => {
    if (!props.projectId || !flowId || isSubflowGraph) return;
    const timer = window.setTimeout(() => void loadSubflows(subflowQuery), 180);
    return () => window.clearTimeout(timer);
  }, [subflowQuery]);


  useEffect(() => {
    if (isSubflowGraph) return;
    return subscribeToAutomationStudioMutations(
      () => { void loadSubflows(subflowQuery); void loadRoutes(routeCursors[routePageIndex] ?? null); },
      { kinds: ["subflow.changed"], projectId: props.projectId, flowId }
    );
  }, [props.projectId, flowId, isSubflowGraph]);

  useEffect(() => {
    if (selectedRule) setRouteDraft(flowMapRouteDraftFromRule(selectedRule));
  }, [selectedRuleId, selectedRule]);

  const loadFlowMap = async () => {
    if (!props.projectId || !flowId || isSubflowGraph) return;
    const requestScope = String(props.projectId) + ":" + String(flowId);
    setError("");
    const result = await props.commands.loadRouter({ projectId: props.projectId, flowId });
    if (scopeRef.current !== requestScope) return;
    if (!result.ok) setError(result.error ?? "Flow Map could not be loaded.");
    else setFlowMap(result.payload?.router ?? null);
  };

  const loadSubflows = async (search = subflowQuery) => {
    if (!props.projectId || !flowId || isSubflowGraph) return;
    const requestScope = String(props.projectId) + ":" + String(flowId);
    setSubflowsLoading(true);
    const result = await props.commands.listSubflows({ projectId: props.projectId, flowId, limit: 50, status: "active", search });
    if (scopeRef.current !== requestScope) return;
    setSubflowsLoading(false);
    if (!result.ok) setError(result.error ?? "Subflow targets could not be loaded.");
    else {
      const page = result.payload?.page;
      setSubflows(result.payload?.subflows ?? page?.subflows ?? []);
      setSubflowTotal(page?.total ?? result.payload?.subflows?.length ?? 0);
    }
  };
  const loadRoutes = async (cursor: string | null) => {
    if (!props.projectId || !flowId || isSubflowGraph) return;
    const requestScope = String(props.projectId) + ":" + String(flowId);
    const result = await props.commands.listRoutes({
      projectId: props.projectId,
      flowId,
      limit: ROUTER_ROUTE_PAGE_SIZE,
      cursor,
      ...(selectedGroupId === "ungrouped" ? { groupId: null } : selectedGroupId !== "all" ? { groupId: selectedGroupId } : {}),
      ...(routeStatus !== "all" ? { status: routeStatus } : {}),
      ...(routeQuery.trim() ? { search: routeQuery.trim() } : {})
    });
    if (scopeRef.current !== requestScope) return;
    if (!result.ok) setError(result.error ?? "Router routes could not be loaded.");
    else {
      const page = result.payload?.page;
      setRoutePage({
        routes: result.payload?.routes ?? page?.routes ?? [],
        counts: { total: page?.counts?.total ?? 0, active: page?.counts?.active ?? 0, disabled: page?.counts?.disabled ?? 0, byGroup: page?.counts?.byGroup ?? {} },
        nextCursor: page?.nextCursor ?? null,
        hasMore: page?.hasMore === true
      });
      if (result.payload?.groups) setFlowMap((current: any) => ({ ...(current ?? {}), metadata: { ...(current?.metadata ?? {}), routeGroups: result.payload?.groups } }));
    }
  };
  const retryFlowMap = async () => {
    setLoading(true);
    setError("");
    await Promise.all([loadFlowMap(), loadRoutes(routeCursors[routePageIndex] ?? null), loadSubflows(subflowQuery)]);
    setLoading(false);
  };
  const beginNewRoute = () => {
    setSubflowQuery("");
    setSelectedRuleId(null);
    setRouteDraft(defaultFlowMapRouteDraft({ targetSubflowId: activeSubflows[0]?.subflowId ?? "", groupId: selectedGroupId !== "all" && selectedGroupId !== "ungrouped" ? selectedGroupId : "" }));
    setRouteTestValue("");
    setRouteTestResult(null);
    setRouteModalOpen(true);
  };

  const editRoute = (rule: any) => {
    setSubflowQuery("");
    setSelectedRuleId(rule.ruleId ?? null);
    setRouteDraft(flowMapRouteDraftFromRule(rule));
    setRouteTestValue("");
    setRouteTestResult(null);
    setRouteModalOpen(true);
  };

  const beginNewGroup = () => {
    setGroupDraft({ groupId: "", name: "", description: "", order: nextFlowMapGroupOrder(routeGroups), collapsed: false, status: "active" });
    setGroupModalOpen(true);
  };

  const editGroup = (group: any) => {
    setGroupDraft({ groupId: group.groupId ?? "", name: group.name ?? "", description: group.description ?? "", order: group.order ?? 0, collapsed: group.collapsed === true, status: group.status ?? "active" });
    setGroupModalOpen(true);
  };

  const beginFallbackEdit = () => {
    setSubflowQuery("");
    const fallback = flowMap?.fallback;
    setFallbackDraft({
      kind: fallback?.kind === "subflow" ? "subflow" : "fail",
      targetSubflowId: fallback?.kind === "subflow" ? fallback.subflowId ?? activeSubflows[0]?.subflowId ?? "" : activeSubflows[0]?.subflowId ?? "",
      message: fallback?.kind === "fail" ? fallback.message ?? "" : ""
    });
    setFallbackModalOpen(true);
  };
  const requestAuthorization = (action: "save-route" | "delete-route" | "save-group" | "delete-group" | "save-fallback" | "mutate-route") => {
    setError("");
    setAuthorization({ action });
    setAuthorizationPin("");
  };

  const requestRouteMutation = (ruleId: string, action: "move_up" | "move_down" | "duplicate" | "toggle" | "delete") => {
    setRouteMutation({ ruleId, action });
    requestAuthorization("mutate-route");
  };
  const runRouteTest = async () => {
    if (!props.projectId || !flowId) return;
    setTestingRoute(true);
    const result = await props.commands.testCondition({ projectId: props.projectId, flowId, ...buildFlowMapRouteTestPayload(routeDraft, routeTestValue) });
    setTestingRoute(false);
    if (!result.ok) {
      setRouteTestResult({ matched: false, reason: result.error ?? "The route test could not be completed." });
      return;
    }
    setRouteTestResult({ matched: result.payload?.matched === true, reason: result.payload?.reason ?? "No explanation was returned." });
  };
  const completeAuthorizedAction = async () => {
    if (!props.projectId || !flowId || !authorization || !authorizationPin.trim()) return;
    setSaving(true);
    setError("");
    const base = { projectId: props.projectId, flowId, authorizationPin: authorizationPin.trim() };
    const result = authorization.action === "save-route"
      ? await props.commands.saveRoute({ ...base, ...(routeDraft.ruleId ? { ruleId: routeDraft.ruleId } : {}), name: routeDraft.name, description: routeDraft.description, targetSubflowId: routeDraft.targetSubflowId, order: routeDraft.order, status: routeDraft.status, groupId: routeDraft.groupId || null, setAsFallback: routeDraft.setAsFallback, confidence: routeDraft.confidence, conditionSummary: flowMapConditionSummary(routeDraft), conditionSignalPath: routeDraft.conditionMode === "when" ? routeDraft.conditionSource + "." + routeDraft.conditionField.trim() : "", conditionOperator: routeDraft.conditionOperator, conditionExpected: flowMapConditionExpected(routeDraft), clearCondition: routeDraft.conditionMode === "always" })
      : authorization.action === "delete-route"
        ? await props.commands.deleteRoute({ ...base, ruleId: routeDraft.ruleId })
        : authorization.action === "save-group"
          ? await props.commands.saveGroup({ ...base, ...(groupDraft.groupId ? { groupId: groupDraft.groupId } : {}), name: groupDraft.name, description: groupDraft.description, order: groupDraft.order, collapsed: groupDraft.collapsed, status: groupDraft.status })
          : authorization.action === "delete-group"
            ? await props.commands.deleteGroup({ ...base, groupId: groupDraft.groupId })
            : authorization.action === "save-fallback"
              ? await props.commands.saveFallback({ ...base, kind: fallbackDraft.kind, ...(fallbackDraft.kind === "subflow" ? { targetSubflowId: fallbackDraft.targetSubflowId } : { message: fallbackDraft.message }) })
              : await props.commands.mutateRoute({ ...base, ruleId: routeMutation?.ruleId, action: routeMutation?.action });
    setSaving(false);
    if (!result.ok || !result.payload?.router) {
      setError(result.error ?? "Flow Map change could not be saved.");
      return;
    }
    setFlowMap(result.payload.router);
    commitAutomationStudioMutation({ kind: "router.changed", projectId: props.projectId, flowId });
    await Promise.all([loadFlowMap(), loadRoutes(routeCursors[routePageIndex] ?? null)]);
    setAuthorization(null);
    setAuthorizationPin("");
    setGroupModalOpen(false);
    if (authorization.action === "save-fallback") setFallbackModalOpen(false);
    if (authorization.action === "save-route") {
      setSelectedRuleId((result.payload.router.rules ?? []).find((rule: any) => rule.name === routeDraft.name)?.ruleId ?? routeDraft.ruleId ?? null);
      setRouteModalOpen(false);
    }
    if (authorization.action === "delete-route") {
      setSelectedRuleId(null);
      setRouteDraft(defaultFlowMapRouteDraft());
      setRouteModalOpen(false);
    }
  };

  if (isSubflowGraph) {
    return <EmptyState compact title="Router belongs to the top-level Flow" description="Select the parent Flow to view or edit routing. Subflows contain node graphs and settings, but do not own Routers." />;
  }

return <RouterContentView
    {...{ activeSubflows, authorization, authorizationPin, beginFallbackEdit, beginNewGroup, beginNewRoute,
      completeAuthorizedAction, editGroup, editRoute, error, fallbackDraft, fallbackModalOpen, flowId,
      flowMap, groupDraft, groupModalOpen, loading, requestAuthorization, requestRouteMutation,
      retryFlowMap, routeDraft, routeGroups, routeModalOpen, routePageOffset, routeTestResult,
      routeTestValue, runRouteTest, saving, selectedGroupId, setAuthorization, setAuthorizationPin,
      setFallbackDraft, setFallbackModalOpen, setGroupDraft, setGroupModalOpen, setRouteDraft,
      setRouteModalOpen, setRouteTestResult, setRouteTestValue, setSelectedGroupId,
      sortedRoutes, subflowOptions, testingRoute, visibleRoutePage, visibleRoutes }}
    routeCounts={routePage.counts}
    routeHasMore={routePage.hasMore}
    routeQuery={routeQuery}
    routeStatus={routeStatus}
    onNextRoutePage={() => {
      if (!routePage.nextCursor) return;
      const nextIndex = routePageIndex + 1;
      setRouteCursors((current) => [...current.slice(0, nextIndex), routePage.nextCursor]);
      setRoutePageIndex(nextIndex);
      void loadRoutes(routePage.nextCursor);
    }}
    onPreviousRoutePage={() => {
      const nextIndex = Math.max(0, routePageIndex - 1);
      setRoutePageIndex(nextIndex);
      void loadRoutes(routeCursors[nextIndex] ?? null);
    }}
    onRouteQuery={setRouteQuery}
    onRouteStatus={setRouteStatus}
    onSubflowQuery={setSubflowQuery}
    subflowTotal={subflowTotal}
    subflowsLoading={subflowsLoading}
    onCreateSubflow={props.onCreateSubflow}
  />;
}

export * from "./route-condition-model";
