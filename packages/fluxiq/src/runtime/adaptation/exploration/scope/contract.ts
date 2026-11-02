/**
 * Where an exploration may go.
 *
 * `same_scope` keeps it where the run already is. `allowlist` names the places
 * it may also reach. Both sides are opaque to Core: the domain supplies the
 * strings and calls `automationStudioExplorationScopeAllows` to compare them,
 * so a domain with no pages and no origins expresses its own idea of "where"
 * in exactly this policy.
 */
export type AutomationStudioExplorationScopePolicy =
  | { kind: "same_scope" }
  | { kind: "allowlist"; scopes: readonly string[] };
