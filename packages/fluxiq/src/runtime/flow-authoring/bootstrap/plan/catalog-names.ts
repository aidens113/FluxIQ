// The node catalog as an evidence decision is shown it: every node by id and
// what it does, grouped by category, and nothing else (user, 2026-10-01: show
// the model only node names; it asks `core.describe_nodes` for the full
// definitions of the nodes it will use).
//
// Nothing is cut: every offered node is listed, and each description is
// whole, with only its whitespace collapsed so an entry is one line. Order is
// deterministic -- categories in the order they first appear in the id-sorted
// catalog, entries by id within each -- because the list sits in the cached
// head of every decision of a build, and a list that reordered between two
// calls would strand the cache behind it
// (`../../llm/deepseek/request-body.ts`).
import type { AutomationStudioFlowBootstrapCatalogEntry, AutomationStudioFlowBootstrapCatalogNames } from "./contracts.ts";

/** `{ "<category>": ["<id>: <description>", ...] }` for every entry of a catalog. */
export function automationStudioFlowBootstrapCatalogNames(
  catalog: readonly Pick<AutomationStudioFlowBootstrapCatalogEntry, "id" | "category" | "description">[]
): AutomationStudioFlowBootstrapCatalogNames {
  const names: AutomationStudioFlowBootstrapCatalogNames = {};
  for (const entry of [...catalog].sort((left, right) => left.id.localeCompare(right.id))) {
    const line = `${entry.id}: ${entry.description.replace(/\s+/gu, " ").trim()}`;
    (names[entry.category] ??= []).push(line);
  }
  return names;
}
