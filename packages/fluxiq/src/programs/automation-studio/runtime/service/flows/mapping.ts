import {
  type AutomationStudioFlowArtifact,
  automationStudioFlowRepresentationKind,
  type AutomationStudioFlowRouteGroup,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowRouteRule,
  type AutomationStudioFlowSubflow,
  isAutomationStudioSubflowGraphMetadata
} from "../../../model/index.ts";
import type { AutomationStudioFlowSummary } from "../../../storage/index.ts";
import { isJsonRecord } from "../json-values.ts";

// Shape conversions between Flow documents and their SQL projections. Shared:
// the flow store writes projections with them and the facade still reads
// summaries and route groups with them.
export function flowMapRouteGroups(router: AutomationStudioFlowRouter): AutomationStudioFlowRouteGroup[] {
  const rawGroups = router.metadata?.routeGroups;
  if (!Array.isArray(rawGroups)) return [];
  const groups = rawGroups.filter(isJsonRecord).map((item, index): AutomationStudioFlowRouteGroup | null => {
    const now = Date.now();
    const groupId = typeof item.groupId === "string" ? item.groupId : "";
    const name = typeof item.name === "string" ? item.name : groupId;
    if (!groupId.trim() || !name.trim()) return null;
    return {
      schemaVersion: "0.1" as const,
      groupId,
      routerId: typeof item.routerId === "string" ? item.routerId : router.routerId,
      name,
      ...(typeof item.description === "string" && item.description.trim() ? { description: item.description.trim() } : {}),
      order: Number.isInteger(item.order) ? Number(item.order) : index * 10,
      status: item.status === "disabled" || item.status === "archived" ? item.status : "active",
      collapsed: item.collapsed === true,
      createdAt: typeof item.createdAt === "number" ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : now,
      ...(isJsonRecord(item.metadata) ? { metadata: item.metadata } : {})
    } satisfies AutomationStudioFlowRouteGroup;
  }).filter((item): item is AutomationStudioFlowRouteGroup => item !== null);
  return groups.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

export function flowMapSortedRules(rules: AutomationStudioFlowRouteRule[]): AutomationStudioFlowRouteRule[] {
  return rules.slice().sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

export function flowSummaryFromFlow(flow: AutomationStudioFlowArtifact): AutomationStudioFlowSummary {
  const hierarchySubflows = flowHierarchySubflowsFromFlow(flow);
  const subflowCategories = flowSubflowCategoriesFromFlow(flow);
  const flowRepresentationKind = automationStudioFlowRepresentationKind(flow)
    ?? (isAutomationStudioSubflowGraphMetadata(flow.metadata)
      ? "subflow_graph"
      : flow.nodes.length || flow.edges.length || flow.legacyProvenance
        ? "legacy_single_graph"
        : "orchestration");
  return {
    flowId: flow.flowId,
    name: flow.name,
    ...(flow.description ? { description: flow.description } : {}),
    scope: flow.scope,
    sourceMode: flow.source.mode,
    publicationStatus: flow.publication.status,
    ...(flow.publication.status !== "draft" && flow.publication.status !== "publishable" ? { version: flow.publication.version } : {}),
    nodeCount: flow.nodes.length,
    edgeCount: flow.edges.length,
    updatedAt: flow.updatedAt,
    ...(Array.isArray(flow.metadata?.recordingProposalIds) ? { recordingProposalIds: flow.metadata.recordingProposalIds.map(String) } : {}),
    flowRepresentationVersion: 1,
    flowRepresentationKind,
    ...(flow.metadata?.subflowGraph === true ? { subflowGraph: true } : {}),
    ...(typeof flow.metadata?.parentFlowId === "string" ? { parentFlowId: flow.metadata.parentFlowId } : {}),
    ...(typeof flow.metadata?.parentSubflowId === "string" ? { parentSubflowId: flow.metadata.parentSubflowId } : {}),
    ...(hierarchySubflows.length ? { hierarchySubflows } : {}),
    ...(subflowCategories.length ? { subflowCategories } : {})
  };
}

export function flowSubflowCategoriesFromFlow(flow: AutomationStudioFlowArtifact): Array<{ id: string; name: string; parentId?: string }> {
  const rawCategories = Array.isArray(flow.metadata?.subflowCategories)
    ? flow.metadata.subflowCategories
    : Array.isArray(flow.metadata?.subflowFolders)
      ? flow.metadata.subflowFolders
      : [];
  const seen = new Set<string>();
  return rawCategories.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const category = raw as Record<string, unknown>;
    const id = String(category.id ?? category.categoryId ?? "");
    const name = typeof category.name === "string" ? category.name.trim() : "";
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const parentId = typeof category.parentId === "string" && category.parentId.trim() && category.parentId !== id ? category.parentId.trim() : undefined;
    return [{ id, name, ...(parentId ? { parentId } : {}) }];
  });
}

export function removeUndefinedSubflowFields(subflow: AutomationStudioFlowSubflow): AutomationStudioFlowSubflow {
  return Object.fromEntries(Object.entries(subflow).filter(([, value]) => value !== undefined)) as unknown as AutomationStudioFlowSubflow;
}

export function subflowParentCategoryId(subflow: AutomationStudioFlowSubflow): string | undefined {
  const metadata = subflow.metadata && typeof subflow.metadata === "object" && !Array.isArray(subflow.metadata) ? subflow.metadata as Record<string, unknown> : {};
  if (typeof metadata.parentCategoryId === "string" && metadata.parentCategoryId.trim()) return metadata.parentCategoryId.trim();
  if (typeof metadata.subflowCategoryId === "string" && metadata.subflowCategoryId.trim()) return metadata.subflowCategoryId.trim();
  if (typeof metadata.categoryId === "string" && metadata.categoryId.trim()) return metadata.categoryId.trim();
  return undefined;
}

export function sqlInstructionRequirement(requirement: string): "guidance" | "required" | "forbidden" {
  if (requirement === "required") return "required";
  if (requirement === "forbidden") return "forbidden";
  return "guidance";
}

export function sqlInstructionStatus(status: string): "draft" | "active" | "archived" | "deleted" {
  if (status === "archived") return "archived";
  if (status === "deleted") return "deleted";
  if (status === "disabled" || status === "draft") return "draft";
  return "active";
}

function flowHierarchySubflowsFromFlow(flow: AutomationStudioFlowArtifact): Array<{ subflowId: string; name?: string; parentCategoryId?: string }> {
  const rawEntries = Array.isArray(flow.expansion?.subflowIds) ? flow.expansion.subflowIds as unknown[] : [];
  const seen = new Set<string>();
  return rawEntries.flatMap((raw) => {
    const entry = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    const subflowId = typeof raw === "string" ? raw : String(entry?.subflowId ?? entry?.id ?? entry?.sourceId ?? "");
    if (!subflowId || seen.has(subflowId)) return [];
    seen.add(subflowId);
    const metadata = entry?.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata) ? entry.metadata as Record<string, unknown> : null;
    const name = typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : undefined;
    const parentCategoryId = typeof metadata?.subflowCategoryId === "string" && metadata.subflowCategoryId.trim()
      ? metadata.subflowCategoryId.trim()
      : typeof metadata?.categoryId === "string" && metadata.categoryId.trim()
        ? metadata.categoryId.trim()
        : undefined;
    return [{ subflowId, ...(name ? { name } : {}), ...(parentCategoryId ? { parentCategoryId } : {}) }];
  });
}
