import { partSearchMatch } from "./search-text.ts";
import type { AutomationStudioProjectPartQuery } from "./types.ts";

const FACETS = ["site", "input", "output", "lasting"] as const;

/**
 * The query's SQL and parameters: the ids of the parts that match, newest version
 * only. Every filter is an exact match; only `text` ranks. Null when the words
 * hold nothing searchable, which matches nothing rather than everything.
 */
export function partQuerySql(query: AutomationStudioProjectPartQuery, offset: number, pageSize: number): { sql: string; params: unknown[] } | null {
  const match = query.text === undefined ? null : partSearchMatch(query.text);
  if (query.text !== undefined && query.text.trim() !== "" && match === null) return null;
  const params: unknown[] = [];
  const clauses: string[] = [];
  let from = "project_parts p";
  if (match) {
    from += " join project_parts_fts on project_parts_fts.part_id = p.part_id and project_parts_fts.version = p.latest_version";
    clauses.push("project_parts_fts match ?");
    params.push(match);
  }
  for (const facet of FACETS) {
    for (const value of listOf(query[facet])) {
      clauses.push("exists (select 1 from project_part_facets x where x.part_id = p.part_id and x.version = p.latest_version and x.facet = ? and x.value = ?)");
      params.push(facet, value);
    }
  }
  if (query.callerFlowId !== undefined) {
    clauses.push("exists (select 1 from part_calls c where c.part_id = p.part_id and c.caller_kind = 'flow_graph' and c.caller_flow_id = ?)");
    params.push(query.callerFlowId);
  }
  if (query.sourceFlowId !== undefined) {
    clauses.push("p.source_flow_id = ?");
    params.push(query.sourceFlowId);
  }
  const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
  const order = match ? "order by rank, p.part_id" : "order by p.updated_at_ms desc, p.part_id";
  params.push(pageSize + 1, offset);
  return { sql: `select p.part_id as part_id from ${from}${where} ${order} limit ? offset ?`, params };
}

function listOf(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : value;
}
