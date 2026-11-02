import type { AutomationStudioExplorationScopePolicy } from "./contract.ts";

/**
 * Whether the policy lets this exploration reach that scope.
 *
 * Fails closed in both directions that matter: an unknown current scope under
 * `same_scope` refuses, because "we do not know where we are" is not a licence
 * to go anywhere, and an empty allowlist refuses everything rather than
 * everything-because-nothing-was-listed. Both are the silent-no-protection
 * shape this plan keeps finding.
 */
export function automationStudioExplorationScopeAllows(
  policy: AutomationStudioExplorationScopePolicy,
  input: { currentScope?: string; requestedScope: string }
): boolean {
  if (typeof input.requestedScope !== "string" || !input.requestedScope.length) return false;
  if (policy.kind === "allowlist") return policy.scopes.includes(input.requestedScope);
  return typeof input.currentScope === "string" && input.currentScope.length > 0 && input.currentScope === input.requestedScope;
}
