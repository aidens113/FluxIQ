import type { AutomationStudioFlowScope } from "../../scope.ts";

export function sameScope(left: AutomationStudioFlowScope, right: AutomationStudioFlowScope): boolean {
  return left.kind === right.kind && (left.kind === "global" || (right.kind === "domain" && left.domainId === right.domainId));
}

export function compositionScopeAllows(caller: AutomationStudioFlowScope, target: AutomationStudioFlowScope, authorizedDomainIds: Iterable<string> | undefined): boolean {
  if (sameScope(caller, target)) return true;
  if (caller.kind === "domain" && target.kind === "global") return true;
  return caller.kind === "global" && target.kind === "domain" && new Set(authorizedDomainIds ?? []).has(target.domainId);
}
