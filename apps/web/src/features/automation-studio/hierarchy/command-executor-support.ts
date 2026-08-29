import { applyCustomFolderDelete } from "../model/local-mutations";
import { mergeFlowDetails } from "../model/project-change-reconciliation";
import { automationHierarchyNodeIsSubflowCategory, automationHierarchyNodeIsSubflowRoot } from "./capabilities";
import type { AutomationHierarchyCommandDependencies, FlowDocument } from "./command-executor-contracts";
import type { AutomationHierarchyNode } from "./contracts";

export async function loadHierarchyFlow(
  flowId: string,
  dependencies: AutomationHierarchyCommandDependencies
): Promise<{ ok: true; flow: FlowDocument } | { ok: false; error: string }> {
  const local = dependencies.findLocalFlow(flowId);
  if (local && local.metadata?.summaryOnly !== true) return { ok: true, flow: local };
  const loaded = await dependencies.commands.loadFlow(flowId);
  if (!loaded.ok || !loaded.payload?.flow) return failure(loaded.error ?? "Flow details could not be loaded.");
  dependencies.updateProjectFlows((current) => mergeFlowDetails(current, [{ source: "canonical", readOnly: false, flow: loaded.payload!.flow }]));
  return { ok: true, flow: loaded.payload.flow };
}

export function hierarchySubflowParent(node: AutomationHierarchyNode): { flowId: string; parentCategoryId: string | null } | null {
  if (!node.flowId) return null;
  if (automationHierarchyNodeIsSubflowRoot(node)) return { flowId: node.flowId, parentCategoryId: null };
  if (automationHierarchyNodeIsSubflowCategory(node) && node.sourceId) return { flowId: node.flowId, parentCategoryId: node.sourceId };
  return null;
}

export function normalizeSubflowCategories(value: unknown): Array<{ id: string; name: string; parentId: string | null; createdAt?: number; updatedAt?: number }> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((raw: any) => {
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ ...raw, id, name, parentId: typeof raw?.parentId === "string" && raw.parentId.trim() ? raw.parentId.trim() : null }];
  });
}

export function removeCustomSubtree(
  rootId: string,
  descendantIds: string[],
  dependencies: AutomationHierarchyCommandDependencies
): void {
  dependencies.updateCustomNodes((current) => applyCustomFolderDelete(current, rootId).next.filter((node) => !descendantIds.includes(node.id)));
}

export function randomId(now: number): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : now + "." + Math.random().toString(36).slice(2);
}

export function isHierarchyNode(value: AutomationHierarchyNode | undefined): value is AutomationHierarchyNode {
  return Boolean(value);
}

export function isString(value: string | undefined): value is string {
  return Boolean(value);
}

export function success(): { ok: true } {
  return { ok: true };
}

export function failure(error: string): { ok: false; error: string } {
  return { ok: false, error };
}