import type { AutomationHierarchyKind, AutomationHierarchyNode } from "./contracts";

export type AutomationHierarchyIndex = {
  byId: Map<string, AutomationHierarchyNode>;
  childrenByParentId: Map<string | null, AutomationHierarchyNode[]>;
};

const hierarchyKindRank: Readonly<Record<AutomationHierarchyKind, number>> = {
  folder: 0,
  flow: 1,
  "flow-object": 2,
  subflow: 3,
  instruction: 3,
  "change-proposal": 3,
  adaptation: 3,
  client: 4,
  proposal: 4,
  task: 4,
  routine: 4,
  config: 4,
  recording: 4,
  run: 4
};

export function sortAutomationHierarchyNodes(nodes: readonly AutomationHierarchyNode[]): AutomationHierarchyNode[] {
  return [...nodes].sort((first, second) =>
    hierarchyKindRank[first.kind] - hierarchyKindRank[second.kind]
    || first.label.localeCompare(second.label)
    || first.id.localeCompare(second.id)
  );
}

export function indexAutomationHierarchyNodes(nodes: readonly AutomationHierarchyNode[]): AutomationHierarchyIndex {
  const byId = new Map<string, AutomationHierarchyNode>();
  const childrenByParentId = new Map<string | null, AutomationHierarchyNode[]>();
  for (const node of nodes) {
    byId.set(node.id, node);
    const children = childrenByParentId.get(node.parentId);
    if (children) children.push(node);
    else childrenByParentId.set(node.parentId, [node]);
  }
  for (const [parentId, children] of childrenByParentId) {
    childrenByParentId.set(parentId, sortAutomationHierarchyNodes(children));
  }
  return { byId, childrenByParentId };
}

export function visibleAutomationHierarchyNodeIds(
  index: AutomationHierarchyIndex,
  predicate: (node: AutomationHierarchyNode) => boolean
): Set<string> {
  const visible = new Set<string>();
  for (const node of index.byId.values()) {
    if (!predicate(node)) continue;
    visible.add(node.id);
    let parentId = node.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      visible.add(parentId);
      parentId = index.byId.get(parentId)?.parentId ?? null;
    }
  }
  return visible;
}

export function collectHierarchyAncestorIds(parentId: string | null, nodes: readonly AutomationHierarchyNode[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors: string[] = [];
  const seen = new Set<string>();
  let cursor = parentId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) break;
    ancestors.push(node.id);
    cursor = node.parentId;
  }
  return ancestors;
}

export function collectHierarchyDescendantIds(parentId: string, nodes: readonly AutomationHierarchyNode[]): string[] {
  const childrenByParentId = new Map<string | null, string[]>();
  for (const node of nodes) {
    const children = childrenByParentId.get(node.parentId);
    if (children) children.push(node.id);
    else childrenByParentId.set(node.parentId, [node.id]);
  }
  const descendants: string[] = [];
  const pending = [...(childrenByParentId.get(parentId) ?? [])].reverse();
  const seen = new Set<string>();
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    descendants.push(nodeId);
    const children = childrenByParentId.get(nodeId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]!);
  }
  return descendants;
}