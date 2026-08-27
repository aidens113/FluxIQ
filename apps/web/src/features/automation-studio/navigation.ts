import { canonicalAutomationWorkspaceViewId } from "./workspace/layout";

export type AutomationStudioDetailKind = "run" | "adaptation" | "recording" | "node" | "state";
export type AutomationStudioFlowScope = { flowId: string; subflowId: string | null };
export type AutomationStudioBreadcrumb = { kind: "flow" | "subflow" | "view"; id: string; label: string; current: boolean };

export type AutomationStudioDeepLink = {
  projectId: string | null;
  flowId: string | null;
  subflowId: string | null;
  viewId: string | null;
  detail: { kind: AutomationStudioDetailKind; id: string } | null;
};

const canonicalViewIds = new Set([
  "client-gateway", "timeline-recording", "policy-primary", "flow-router",
  "flow-subflows", "flow-instructions", "adaptations", "flow-settings",
  "state-explorer", "runtime-debug", "problems-view", "global-inspector"
]);
const detailKinds = new Set<AutomationStudioDetailKind>(["run", "adaptation", "recording", "node", "state"]);

export function parseAutomationStudioDeepLink(input: URLSearchParams | string): AutomationStudioDeepLink {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const projectId = clean(params.get("project"));
  const flowId = projectId ? clean(params.get("flow")) : null;
  const subflowId = flowId ? clean(params.get("subflow")) : null;
  const candidateViewId = projectId ? canonicalAutomationWorkspaceViewId(clean(params.get("view")) ?? "") : "";
  return {
    projectId,
    flowId,
    subflowId,
    viewId: canonicalViewIds.has(candidateViewId) ? candidateViewId : null,
    detail: projectId ? parseDetail(params.get("detail")) : null
  };
}

export function automationStudioDeepLinkParams(link: Partial<AutomationStudioDeepLink>, base?: URLSearchParams | string): URLSearchParams {
  const params = typeof base === "string" ? new URLSearchParams(base) : new URLSearchParams(base?.toString());
  const projectId = clean(link.projectId);
  setOrDelete(params, "project", projectId);
  setOrDelete(params, "flow", projectId ? clean(link.flowId) : null);
  setOrDelete(params, "subflow", projectId && clean(link.flowId) ? clean(link.subflowId) : null);
  const viewId = projectId && link.viewId ? canonicalAutomationWorkspaceViewId(link.viewId) : null;
  setOrDelete(params, "view", viewId && canonicalViewIds.has(viewId) ? viewId : null);
  const detailId = link.detail ? clean(link.detail.id) : null;
  setOrDelete(params, "detail", projectId && link.detail && detailKinds.has(link.detail.kind) && detailId
    ? `${link.detail.kind}:${detailId}`
    : null);
  return params;
}


export function automationStudioFlowScope(flowId: string, flowEntries: unknown[]): AutomationStudioFlowScope {
  const entry = flowEntries.find((candidate: any) => String(candidate?.flow?.flowId ?? candidate?.flowId ?? "") === flowId) as any;
  const flow = entry?.flow ?? entry;
  const parentFlowId = clean(flow?.metadata?.parentFlowId);
  const parentSubflowId = clean(flow?.metadata?.parentSubflowId);
  return parentFlowId && parentSubflowId
    ? { flowId: parentFlowId, subflowId: parentSubflowId }
    : { flowId, subflowId: null };
}

export function automationStudioWorkspaceBreadcrumbs(input: { flowId: string | null | undefined; flowName: string | null | undefined; subflowId: string | null | undefined; subflowName: string | null | undefined; viewId: string; viewLabel: string }): AutomationStudioBreadcrumb[] {
  if (!input.flowId) return [];
  const crumbs: AutomationStudioBreadcrumb[] = [
    { kind: "flow", id: input.flowId, label: clean(input.flowName) ?? input.flowId, current: false }
  ];
  if (input.subflowId) crumbs.push({ kind: "subflow", id: input.subflowId, label: clean(input.subflowName) ?? input.subflowId, current: false });
  crumbs.push({ kind: "view", id: input.viewId, label: input.viewLabel, current: true });
  return crumbs;
}

export function automationStudioDefaultViewForLink(link: Pick<AutomationStudioDeepLink, "flowId" | "subflowId" | "viewId">): string | null {
  if (link.viewId) return link.viewId;
  if (link.subflowId) return "policy-primary";
  if (link.flowId) return "flow-router";
  return null;
}
function parseDetail(value: string | null): AutomationStudioDeepLink["detail"] {
  const separator = value?.indexOf(":") ?? -1;
  if (!value || separator < 1) return null;
  const kind = value.slice(0, separator) as AutomationStudioDetailKind;
  const id = clean(value.slice(separator + 1));
  return detailKinds.has(kind) && id ? { kind, id } : null;
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value) params.set(key, value);
  else params.delete(key);
}