// The runtime summary projection (`runtime.sessions` in the project's runtime
// SQLite) read one page at a time: filtered in SQL, newest queued first, with
// a keyset cursor, and only the summary rows -- never a session file.

import type { JsonObject } from "../../../../../core/index.ts";
import type { SQLiteRepository } from "../../../../database-manager/storage/sqlite-repository.ts";
import type { AutomationStudioRuntimeRunSummary, AutomationStudioRuntimeRunSummaryPage } from "../../../storage/index.ts";
import type { AutomationStudioRuntimeSessionListingFilter } from "./filter.ts";
import { automationStudioRuntimeSummaryPage } from "./page.ts";

const QUEUED_AT = "coalesce(json_extract(data, '$.queuedAt'), 0)";

export async function listAutomationStudioRuntimeSummarySqlPage(repository: SQLiteRepository<JsonObject>, filter: AutomationStudioRuntimeSessionListingFilter): Promise<AutomationStudioRuntimeRunSummaryPage> {
  const { clauses, params } = filterClauses(filter);
  const where = (extra: string[]) => (extra.length ? ` where ${extra.join(" and ")}` : "");
  const position = filter.cursor ? [`(${QUEUED_AT} < ? or (${QUEUED_AT} = ? and id < ?))`] : [];
  const positionParams = filter.cursor ? [filter.cursor.queuedAt, filter.cursor.queuedAt, filter.cursor.runId] : [];
  const result = await repository.transaction({}, async (transaction) => {
    const totalRow = await transaction.get<{ total: number }>(`select count(*) as total from ${repository.tableName}${where(clauses)}`, params);
    const rows = await transaction.all<{ data: string }>(
      `select data from ${repository.tableName}${where([...clauses, ...position])} order by ${QUEUED_AT} desc, id desc limit ? offset ?`,
      [...params, ...positionParams, filter.limit + 1, filter.offset]
    );
    return { total: totalRow?.total ?? 0, rows: rows.map((row) => JSON.parse(row.data) as AutomationStudioRuntimeRunSummary) };
  });
  return automationStudioRuntimeSummaryPage(result.rows, filter, result.total);
}

/** The summary rows written before `version`, with what they hold, so the store can rewrite each from its session. */
export async function listStaleAutomationStudioRuntimeSummaries(repository: SQLiteRepository<JsonObject>, version: number): Promise<AutomationStudioRuntimeRunSummary[]> {
  const rows = await repository.transaction({}, async (transaction) => await transaction.all<{ data: string }>(
    `select data from ${repository.tableName} where coalesce(json_extract(data, '$.summaryVersion'), 1) < ?`,
    [version]
  ));
  return rows.map((row) => JSON.parse(row.data) as AutomationStudioRuntimeRunSummary);
}

function filterClauses(filter: AutomationStudioRuntimeSessionListingFilter): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, values: readonly unknown[]) => {
    clauses.push(clause);
    params.push(...values);
  };
  if (filter.flowId !== undefined) add("json_extract(data, '$.flowId') = ?", [filter.flowId]);
  if (filter.candidateId !== undefined) add("json_extract(data, '$.candidateTrial.candidateId') = ?", [filter.candidateId]);
  if (filter.runIds !== undefined) add(`id in (${filter.runIds.map(() => "?").join(", ")})`, filter.runIds);
  if (filter.statuses !== undefined) add(`json_extract(data, '$.status') in (${filter.statuses.map(() => "?").join(", ")})`, filter.statuses);
  return { clauses, params };
}
