import { compactConditionLabel } from "../runtime";

const SUBFLOW_PAGE_SIZE = 25;

export type SubflowDirectoryState = {
  search: string;
  status: string;
  role: string;
  sort: "updated" | "name" | "status" | "role";
  direction: "asc" | "desc";
  limit: number;
  offset: number;
};

export function readSubflowDirectoryUrlState(input: Partial<SubflowDirectoryState> = {}): SubflowDirectoryState {

  const limit = input.limit !== undefined && [10, 25, 50].includes(input.limit) ? input.limit : SUBFLOW_PAGE_SIZE;
  const sort = input.sort;
  return {
    search: input.search ?? "",
    status: input.status ?? "",
    role: input.role ?? "",
    sort: sort === "name" || sort === "status" || sort === "role" ? sort : "updated",
    direction: input.direction === "asc" ? "asc" : "desc",
    limit,
    offset: Math.max(0, Number(input.offset) || 0)
  };
}

export function subflowReadiness(subflow: any): { label: "Ready" | "Needs setup"; tone: "ready" | "attention"; issues: string[] } {
  const issues: string[] = [];
  if (!subflow?.graphFlowId) issues.push("Nodes graph is missing");
  if (subflow?.status !== "active") issues.push(subflow?.status === "archived" ? "Subflow is archived" : "Subflow is disabled");
  return issues.length ? { label: "Needs setup", tone: "attention", issues } : { label: "Ready", tone: "ready", issues };
}

export function routerReferencesForSubflow(router: any | null, subflowId: string): Array<{ id: string; name: string; status: string; order: string | number; condition: string }> {
  if (!router || !subflowId) return [];
  const target = (router.targets ?? router.batch?.targets ?? []).find((item: any) => item?.subflowId === subflowId);
  if (target) return (target.references ?? []).map((reference: any) => ({
    id: reference.id,
    name: reference.name ?? reference.id ?? "Route rule",
    status: reference.status ?? "active",
    order: reference.order ?? "-",
    condition: reference.conditionLabel ?? (reference.condition ? compactConditionLabel(reference.condition) : "Always")
  }));
  const rules = (router.rules ?? [])
    .filter((rule: any) => rule?.target?.kind === "subflow" && rule.target.subflowId === subflowId)
    .map((rule: any) => ({
      id: rule.ruleId ?? rule.name,
      name: rule.name ?? rule.ruleId ?? "Route rule",
      status: rule.status ?? "active",
      order: rule.order ?? "-",
      condition: rule.condition ? compactConditionLabel(rule.condition) : "Always"
    }));
  const fallback = router.fallback?.kind === "subflow" && router.fallback.subflowId === subflowId
    ? [{ id: `${router.routerId}:fallback`, name: "Fallback", status: router.status ?? "active", order: "fallback", condition: "No rule matched" }]
    : [];
  return [...rules, ...fallback];
}

export function routerReferenceSummaryForSubflow(router: any | null, subflowId: string): { references: ReturnType<typeof routerReferencesForSubflow>; total: number; hasMore: boolean } {
  const references = routerReferencesForSubflow(router, subflowId);
  const target = (router?.targets ?? router?.batch?.targets ?? []).find((item: any) => item?.subflowId === subflowId);
  return { references, total: Number.isSafeInteger(target?.total) ? target.total : references.length, hasMore: target?.hasMore === true };
}
