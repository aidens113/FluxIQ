import { automationStudioViewId, canonicalAutomationStudioViewId, isAutomationStudioViewId } from "./views/view-registry";

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

const detailKinds = new Set<AutomationStudioDetailKind>(["run", "adaptation", "recording", "node", "state"]);

export function parseAutomationStudioDeepLink(input: URLSearchParams | string): AutomationStudioDeepLink {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const projectId = clean(params.get("project"));
  const flowId = projectId ? clean(params.get("flow")) : null;
  const subflowId = flowId ? clean(params.get("subflow")) : null;
  const candidateViewId = projectId ? canonicalAutomationStudioViewId(clean(params.get("view")) ?? "", { hasFlow: Boolean(flowId) }) : "";
  return {
    projectId,
    flowId,
    subflowId,
    viewId: isAutomationStudioViewId(candidateViewId) ? candidateViewId : null,
    detail: projectId ? parseDetail(params.get("detail")) : null
  };
}

export function automationStudioDeepLinkParams(link: Partial<AutomationStudioDeepLink>, base?: URLSearchParams | string): URLSearchParams {
  const params = typeof base === "string" ? new URLSearchParams(base) : new URLSearchParams(base?.toString());
  const projectId = clean(link.projectId);
  setOrDelete(params, "project", projectId);
  setOrDelete(params, "flow", projectId ? clean(link.flowId) : null);
  setOrDelete(params, "subflow", projectId && clean(link.flowId) ? clean(link.subflowId) : null);
  const viewId = projectId && link.viewId ? canonicalAutomationStudioViewId(link.viewId, { hasFlow: Boolean(clean(link.flowId)) }) : null;
  setOrDelete(params, "view", viewId && isAutomationStudioViewId(viewId) ? viewId : null);
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
  if (link.subflowId) return automationStudioViewId.flowEditor;
  if (link.flowId) return automationStudioViewId.router;
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