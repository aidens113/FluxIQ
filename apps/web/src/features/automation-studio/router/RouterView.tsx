"use client";

import { StatusText } from "../../programs/shared-ui";
import { useEffect, useMemo, useRef, useState } from "react";


import { subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";
import { useRouterCommands, type RouterCommands } from "./router-host";
import { buildFlowMapRouteTestPayload, defaultFlowMapRouteDraft, flowMapConditionExpected, flowMapConditionSummary, flowMapRouteDraftFromRule, flowMapRouteGroupsFromRouter, flowMapRoutes, nextFlowMapGroupOrder } from "./route-condition-model";
import { RouterContentView, ROUTER_ROUTE_PAGE_SIZE } from "./RouterContentView";


export type RouterViewProps = { projectId: string | null; flow: any; initialRouter?: any; initialSubflows?: any[]; onCreateSubflow?(): void };

export function RouterView(props: RouterViewProps) {
  const commands = useRouterCommands();
  return <RouterViewContent {...props} commands={commands} />;
}

export function RouterViewContent(props: RouterViewProps & { commands: RouterCommands }) {
  const flowId = props.flow?.flowId;
  const [flowMap, setFlowMap] = useState<any | null>(() => props.initialRouter ?? null);
  const [subflows, setSubflows] = useState<any[]>(() => props.initialSubflows ?? []);
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const [routePageOffset, setRoutePageOffset] = useState(0);
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
  const [loading, setLoading] = useState(() => Boolean(props.projectId && flowId && !props.initialSubflows?.length));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const scopeRef = useRef("");
  const routeGroups = useMemo(() => flowMapRouteGroupsFromRouter(flowMap), [flowMap]);
  const sortedRoutes = useMemo(() => flowMapRoutes(flowMap), [flowMap]);
  const visibleRoutes = useMemo(() => sortedRoutes.filter((route) => selectedGroupId === "all" ? true : selectedGroupId === "ungrouped" ? !route.metadata?.groupId : route.metadata?.groupId === selectedGroupId), [sortedRoutes, selectedGroupId]);
  const visibleRoutePage = useMemo(() => visibleRoutes.slice(routePageOffset, routePageOffset + ROUTER_ROUTE_PAGE_SIZE), [routePageOffset, visibleRoutes]);
  const selectedRule = useMemo(() => sortedRoutes.find((route) => route.ruleId === selectedRuleId) ?? null, [sortedRoutes, selectedRuleId]);
  const activeSubflows = useMemo(() => subflows.filter((subflow) => subflow.status !== "archived").sort((left, right) => String(left.name ?? left.subflowId).localeCompare(String(right.name ?? right.subflowId))), [subflows]);
  const subflowOptions = useMemo(() => activeSubflows.map((subflow) => ({ value: subflow.subflowId, label: subflow.name ?? subflow.subflowId, description: [subflow.description, subflow.role ? "Role: " + subflow.role : "", subflow.subflowId].filter(Boolean).join(" | ") })), [activeSubflows]);

  useEffect(() => {
    scopeRef.current = String(props.projectId ?? "") + ":" + String(flowId ?? "");
    setSelectedRuleId(null);
    setRouteDraft(defaultFlowMapRouteDraft());
    setRouteModalOpen(false);
    if (!props.projectId || !flowId) return;
    setLoading(true);
    void Promise.all([loadFlowMap(), loadSubflows()]).finally(() => setLoading(false));
  }, [props.projectId, flowId]);
  useEffect(() => setRoutePageOffset(0), [props.projectId, flowId, selectedGroupId]);
  useEffect(() => {
    if (routePageOffset < visibleRoutes.length || routePageOffset === 0) return;
    setRoutePageOffset(Math.max(0, Math.floor((Math.max(0, visibleRoutes.length - 1)) / ROUTER_ROUTE_PAGE_SIZE) * ROUTER_ROUTE_PAGE_SIZE));
  }, [routePageOffset, visibleRoutes.length]);


  useEffect(() => subscribeToAutomationStudioMutations(
    () => void loadSubflows(),
    { kinds: ["subflow.changed"], projectId: props.projectId, flowId }
  ), [props.projectId, flowId]);

  useEffect(() => {
    if (selectedRule) setRouteDraft(flowMapRouteDraftFromRule(selectedRule));
  }, [selectedRuleId, selectedRule]);

  const loadFlowMap = async () => {
    if (!props.projectId || !flowId) return;
    const requestScope = String(props.projectId) + ":" + String(flowId);
    setError("");
    const result = await props.commands.loadRouter({ projectId: props.projectId, flowId });
    if (scopeRef.current !== requestScope) return;
    if (!result.ok) setError(result.error ?? "Flow Map could not be loaded.");
    else setFlowMap(result.payload?.router ?? null);
  };

  const loadSubflows = async () => {
    if (!props.projectId || !flowId) return;
    const requestScope = String(props.projectId) + ":" + String(flowId);
    const result = await props.commands.listSubflows({ projectId: props.projectId, flowId, limit: 100, offset: 0 });
    if (scopeRef.current !== requestScope) return;
    if (!result.ok) setError(result.error ?? "Subflow targets could not be loaded.");
    else setSubflows(result.payload?.subflows ?? result.payload?.page?.subflows ?? []);
  };
  const retryFlowMap = async () => {
    setLoading(true);
    setError("");
    await Promise.all([loadFlowMap(), loadSubflows()]);
    setLoading(false);
  };
  const beginNewRoute = () => {
    setSelectedRuleId(null);
    setRouteDraft(defaultFlowMapRouteDraft({ targetSubflowId: activeSubflows[0]?.subflowId ?? "", groupId: selectedGroupId !== "all" && selectedGroupId !== "ungrouped" ? selectedGroupId : "" }));
    setRouteTestValue("");
    setRouteTestResult(null);
    setRouteModalOpen(true);
  };

  const editRoute = (rule: any) => {
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
    const fallback = flowMap?.fallback;
    setFallbackDraft({
      kind: fallback?.kind === "subflow" ? "subflow" : "fail",
      targetSubflowId: fallback?.kind === "subflow" ? fallback.subflowId ?? activeSubflows[0]?.subflowId ?? "" : activeSubflows[0]?.subflowId ?? "",
      message: fallback?.kind === "fail" ? fallback.message ?? "" : ""
    });
    setFallbackModalOpen(true);
  };
  const requestAuthorization = (action: "save-route" | "delete-route" | "save-group" | "delete-group" | "save-fallback" | "mutate-route") => {
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
    setAuthorization(null);
    setAuthorizationPin("");
    setGroupModalOpen(false);
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

return <RouterContentView
    {...{ activeSubflows, authorization, authorizationPin, beginFallbackEdit, beginNewGroup, beginNewRoute,
      completeAuthorizedAction, editGroup, editRoute, error, fallbackDraft, fallbackModalOpen, flowId,
      flowMap, groupDraft, groupModalOpen, loading, requestAuthorization, requestRouteMutation,
      retryFlowMap, routeDraft, routeGroups, routeModalOpen, routePageOffset, routeTestResult,
      routeTestValue, runRouteTest, saving, selectedGroupId, setAuthorization, setAuthorizationPin,
      setFallbackDraft, setFallbackModalOpen, setGroupDraft, setGroupModalOpen, setRouteDraft,
      setRouteModalOpen, setRoutePageOffset, setRouteTestResult, setRouteTestValue, setSelectedGroupId,
      sortedRoutes, subflowOptions, testingRoute, visibleRoutePage, visibleRoutes }}
    onCreateSubflow={props.onCreateSubflow}
  />;
}

export * from "./route-condition-model";